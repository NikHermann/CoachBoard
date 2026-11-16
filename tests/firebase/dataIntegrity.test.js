import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { doc, getDoc } from "firebase/firestore";
import { sendPasswordResetEmail, confirmPasswordReset } from "firebase/auth";
import { AUTH_EMULATOR_HOST, PROJECT_ID, installLocalNetworkGuard } from "./emulatorSafety.js";
import { SYNTHETIC_ACCOUNTS, SYNTHETIC_DOCUMENT_IDS } from "./fixtures/syntheticAccounts.js";
import {
  createFirebaseTestHarness,
  resetSyntheticState,
  seedSyntheticState
} from "./testFirebase.js";

let harness;
let restoreNetwork;

before(async () => {
  restoreNetwork = installLocalNetworkGuard();
  harness = await createFirebaseTestHarness("integrity");
});

beforeEach(async () => {
  await resetSyntheticState(harness);
  await seedSyntheticState(harness);
});

after(async () => {
  await harness?.cleanup();
  restoreNetwork?.();
});

test("Passwort-Reset verändert keine Firestore-IDs oder Trainingsreferenzen", async () => {
  let beforeProfile;
  let beforeTraining;
  await harness.testEnv.withSecurityRulesDisabled(async (context) => {
    beforeProfile = await getDoc(doc(context.firestore(), "users", SYNTHETIC_DOCUMENT_IDS.legacyPassword));
    beforeTraining = await getDoc(doc(context.firestore(), "trainings", SYNTHETIC_DOCUMENT_IDS.training));
  });

  await sendPasswordResetEmail(harness.auth, SYNTHETIC_ACCOUNTS.modern.email);
  const response = await fetch(`http://${AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
  const payload = await response.json();
  const resetCode = payload.oobCodes.find((entry) => entry.requestType === "PASSWORD_RESET").oobCode;
  await confirmPasswordReset(harness.auth, resetCode, "Integrity!Pass456");

  await harness.testEnv.withSecurityRulesDisabled(async (context) => {
    const afterProfile = await getDoc(doc(context.firestore(), "users", SYNTHETIC_DOCUMENT_IDS.legacyPassword));
    const afterTraining = await getDoc(doc(context.firestore(), "trainings", SYNTHETIC_DOCUMENT_IDS.training));
    assert.equal(afterProfile.id, beforeProfile.id);
    assert.deepEqual(afterProfile.data(), beforeProfile.data());
    assert.equal(afterTraining.id, beforeTraining.id);
    assert.deepEqual(afterTraining.data(), beforeTraining.data());
    assert.equal(afterTraining.data().created_by_user_id, SYNTHETIC_DOCUMENT_IDS.legacyPassword);
  });
});
