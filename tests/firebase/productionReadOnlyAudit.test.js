import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { createFirebaseTestHarness, resetSyntheticState } from "./testFirebase.js";

const require = createRequire(import.meta.url);
const { createEmulatorAdminProvisioning } = require("../../functions/adminProvisioningEmulator.js");
const {
  analyzeReadOnlyAudit,
  collectReadOnlySnapshot
} = require("../../functions/audit/readOnlyAudit.cjs");

let harness;
let adminSdk;

before(async () => {
  harness = await createFirebaseTestHarness("production-read-only-audit", "firestore.target.rules");
  adminSdk = createEmulatorAdminProvisioning();
});

beforeEach(async () => {
  await resetSyntheticState(harness);
});

after(async () => {
  await harness?.cleanup();
});

test("aggregiert korrekte, fehlerhafte und mehrdeutige Zuordnungen ohne Identitätsausgabe", () => {
  const summary = analyzeReadOnlyAudit({
    authUsers: [
      { uid: "auth-1", disabled: false, roleClaim: "trainer" },
      { uid: "auth-2", disabled: true, roleClaim: "spieler", profileIdClaim: "legacy-2" },
      { uid: "auth-3", disabled: false },
      { uid: "auth-4", disabled: false, roleClaim: "admin", profileIdClaim: "legacy-4" }
    ],
    profiles: [
      { id: "auth-1", uid: "auth-1", role: "trainer" },
      { id: "legacy-2", uid: "auth-2", role: "spieler" },
      { id: "auth-3", uid: "auth-3", role: "admin" },
      { id: "auth-4", uid: "auth-4", role: "admin" },
      { id: "legacy-4", uid: "auth-4", role: "admin" },
      { id: "orphan", uid: "missing-auth", role: "spieler" },
      { id: "missing-uid", role: "spieler" }
    ],
    trainings: [
      { createdByUserId: "auth-1", createdByAuthUid: "auth-1" },
      { createdByUserId: "legacy-2" },
      { createdByUserId: "orphan" },
      { createdByUserId: "legacy-4" }
    ],
    passwordProfileCount: 1
  });

  assert.deepEqual(summary, {
    authAccounts: 4,
    activeAuthAccounts: 3,
    disabledAuthAccounts: 1,
    firestoreProfiles: 7,
    uniqueProfileMappings: 3,
    profilesWithMissingOrConflictingUid: 2,
    profilesWithPasswordField: 1,
    roleClaimsPresent: 3,
    roleClaimsMissingOrMismatched: 1,
    ambiguousProfileMappings: 1,
    trainings: 4,
    trainingsWithLegacyOwnerReference: 4,
    trainingsWithUnclearOwner: 2
  });
  assert.doesNotMatch(JSON.stringify(summary), /auth-1|legacy-2|orphan/);

  const invalidClaim = analyzeReadOnlyAudit({
    authUsers: [{ uid: "invalid-claim", disabled: false, roleClaim: "owner" }],
    profiles: [],
    trainings: [],
    passwordProfileCount: 0
  });
  assert.equal(invalidClaim.roleClaimsPresent, 1);
  assert.equal(invalidClaim.roleClaimsMissingOrMismatched, 1);
});

test("liest im Emulator nur maskierte Felder und liefert anonymisierte Aggregate", async () => {
  const first = await adminSdk.auth.createUser({ email: "audit.one@example.invalid", disabled: false });
  const second = await adminSdk.auth.createUser({ email: "audit.two@example.invalid", disabled: true });
  await adminSdk.auth.setCustomUserClaims(first.uid, { role: "trainer" });
  await adminSdk.auth.setCustomUserClaims(second.uid, { role: "spieler", profile_id: "legacy-audit-two" });

  await adminSdk.firestore.collection("users").doc(first.uid).set({
    uid: first.uid,
    role: "trainer",
    email: "audit.one@example.invalid",
    displayName: "Synthetic Audit One"
  });
  await adminSdk.firestore.collection("users").doc("legacy-audit-two").set({
    uid: second.uid,
    role: "spieler",
    password: "synthetic-value-never-returned"
  });
  await adminSdk.firestore.collection("trainings").doc("audit-training-modern").set({
    created_by_user_id: first.uid,
    created_by_auth_uid: first.uid,
    title: "Synthetic title not returned"
  });
  await adminSdk.firestore.collection("trainings").doc("audit-training-legacy").set({
    created_by_user_id: "legacy-audit-two"
  });

  const snapshot = await collectReadOnlySnapshot({
    auth: adminSdk.auth,
    firestore: adminSdk.firestore
  });
  const summary = analyzeReadOnlyAudit(snapshot);

  assert.equal(summary.authAccounts, 2);
  assert.equal(summary.activeAuthAccounts, 1);
  assert.equal(summary.disabledAuthAccounts, 1);
  assert.equal(summary.uniqueProfileMappings, 2);
  assert.equal(summary.profilesWithPasswordField, 1);
  assert.equal(summary.roleClaimsPresent, 2);
  assert.equal(summary.trainingsWithUnclearOwner, 0);
  assert.equal(snapshot.readEstimate.firestoreProfileDocuments, 2);
  assert.equal(snapshot.readEstimate.firestoreTrainingDocuments, 2);
  assert.equal(Object.hasOwn(snapshot.profiles[0], "email"), false);
  assert.equal(Object.hasOwn(snapshot.profiles[0], "password"), false);
  assert.equal(Object.hasOwn(snapshot.trainings[0], "title"), false);
});

test("Produktionsrunner enthält keine bekannten Mutationsaufrufe", () => {
  const sources = [
    "../../functions/audit/productionReadOnlyAudit.cjs",
    "../../functions/audit/readOnlyAudit.cjs"
  ].map((path) => fs.readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
  const forbiddenPatterns = [
    /\.(?:createUser|updateUser|deleteUser|deleteUsers|setCustomUserClaims)\s*\(/,
    /\.(?:bulkWriter|runTransaction|recursiveDelete)\s*\(/,
    /\.(?:add|create|update|delete)\s*\(/
  ];

  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(sources, pattern, `Unerlaubter Firebase-Mutationsaufruf: ${pattern}`);
  }
});
