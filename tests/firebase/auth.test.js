import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { installLocalNetworkGuard } from "./emulatorSafety.js";
import { SYNTHETIC_ACCOUNTS, SYNTHETIC_DOCUMENT_IDS } from "./fixtures/syntheticAccounts.js";
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
  harness = await createFirebaseTestHarness("auth");
});

beforeEach(async () => {
  await resetSyntheticState(harness);
  seeded = await seedSyntheticState(harness);
});

after(async () => {
  await harness?.cleanup();
  restoreNetwork?.();
});

test("moderner Auth-Benutzer kann sich mit richtigem Passwort anmelden", async () => {
  const credential = await signInWithEmailAndPassword(
    harness.auth,
    SYNTHETIC_ACCOUNTS.modern.email,
    SYNTHETIC_ACCOUNTS.modern.password
  );
  assert.equal(credential.user.uid, seeded.modernUid);
});

test("falsches Passwort wird vom Authentication Emulator abgewiesen", async () => {
  await assert.rejects(
    () => signInWithEmailAndPassword(harness.auth, SYNTHETIC_ACCOUNTS.modern.email, "Wrong!Pass123"),
    /auth\/(invalid-credential|wrong-password)/
  );
});

test("Legacy-Profil ohne Auth-Konto kann sich nicht über Firebase Auth anmelden", async () => {
  await assert.rejects(
    () => signInWithEmailAndPassword(
      harness.auth,
      SYNTHETIC_ACCOUNTS.legacyPassword.email,
      SYNTHETIC_ACCOUNTS.legacyPassword.password
    ),
    /auth\/(invalid-credential|user-not-found)/
  );
});

test("verwaistes Auth-Konto besitzt kein Firestore-Profil", async () => {
  const credential = await signInWithEmailAndPassword(
    harness.auth,
    SYNTHETIC_ACCOUNTS.orphanAuth.email,
    SYNTHETIC_ACCOUNTS.orphanAuth.password
  );
  const db = harness.testEnv.authenticatedContext(credential.user.uid).firestore();
  const profile = await getDoc(doc(db, "users", credential.user.uid));
  assert.equal(profile.exists(), false);
  await signOut(harness.auth);
});

test("abweichende Auth-UID und Dokument-ID bleiben explizit erhalten", async () => {
  const db = harness.testEnv.authenticatedContext(seeded.migratedUid).firestore();
  const profile = await getDoc(doc(db, "users", SYNTHETIC_DOCUMENT_IDS.migrated));
  assert.equal(profile.exists(), true);
  assert.equal(profile.id, SYNTHETIC_DOCUMENT_IDS.migrated);
  assert.equal(profile.data().uid, seeded.migratedUid);
});
