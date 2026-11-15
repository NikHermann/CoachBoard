import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import {
  sendPasswordResetEmail,
  confirmPasswordReset,
  signInWithEmailAndPassword
} from "firebase/auth";
import { AUTH_EMULATOR_HOST, PROJECT_ID, installLocalNetworkGuard } from "./emulatorSafety.js";
import { SYNTHETIC_ACCOUNTS } from "./fixtures/syntheticAccounts.js";
import {
  createFirebaseTestHarness,
  resetSyntheticState,
  seedSyntheticState
} from "./testFirebase.js";

let harness;
let restoreNetwork;

before(async () => {
  restoreNetwork = installLocalNetworkGuard();
  harness = await createFirebaseTestHarness("password-reset");
});

beforeEach(async () => {
  await resetSyntheticState(harness);
  await seedSyntheticState(harness);
});

after(async () => {
  await harness?.cleanup();
  restoreNetwork?.();
});

async function getLatestResetCode(email) {
  const response = await fetch(`http://${AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
  assert.equal(response.ok, true);
  const payload = await response.json();
  const code = payload.oobCodes
    ?.filter((entry) => entry.requestType === "PASSWORD_RESET" && entry.email === email)
    .at(-1);
  assert.ok(code?.oobCode, "Der Authentication Emulator hat keinen Reset-Code erzeugt.");
  return code.oobCode;
}

test("Passwort-Reset ersetzt das Auth-Passwort und macht den Code einmalig", async () => {
  const account = SYNTHETIC_ACCOUNTS.modern;
  const newPassword = "Reset!Pass456";

  await sendPasswordResetEmail(harness.auth, account.email);
  const resetCode = await getLatestResetCode(account.email);
  await confirmPasswordReset(harness.auth, resetCode, newPassword);

  await assert.rejects(
    () => signInWithEmailAndPassword(harness.auth, account.email, account.password),
    /auth\/(invalid-credential|wrong-password)/
  );
  const credential = await signInWithEmailAndPassword(harness.auth, account.email, newPassword);
  assert.ok(credential.user.uid);
  await assert.rejects(
    () => confirmPasswordReset(harness.auth, resetCode, "Another!Pass789"),
    /auth\/invalid-action-code/
  );
});
