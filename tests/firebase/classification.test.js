import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { collection, getDocs } from "firebase/firestore";
import { classifyProfiles } from "./classification.js";
import { installLocalNetworkGuard } from "./emulatorSafety.js";
import {
  createFirebaseTestHarness,
  resetSyntheticState,
  seedSyntheticState
} from "./testFirebase.js";

let harness;
let seeded;
let restoreNetwork;

before(async () => {
  restoreNetwork = installLocalNetworkGuard();
  harness = await createFirebaseTestHarness("classification");
});

beforeEach(async () => {
  await resetSyntheticState(harness);
  seeded = await seedSyntheticState(harness);
});

after(async () => {
  await harness?.cleanup();
  restoreNetwork?.();
});

test("Kontotypen werden ausschließlich aggregiert klassifiziert", async () => {
  let profiles;
  await harness.testEnv.withSecurityRulesDisabled(async (context) => {
    const snapshot = await getDocs(collection(context.firestore(), "users"));
    profiles = snapshot.docs.map((profile) => ({ id: profile.id, data: profile.data() }));
  });

  const result = classifyProfiles(profiles, [seeded.modernUid, seeded.migratedUid, seeded.orphanAuthUid]);
  assert.deepEqual(result, {
    modern: 1,
    migrated: 2,
    legacyWithPassword: 1,
    legacyWithoutPassword: 4,
    missingEmail: 1,
    duplicateEmailGroups: 1,
    duplicateUsernameGroups: 1,
    orphanProfiles: 1,
    orphanAuthAccounts: 1
  });
});
