import test, { before, beforeEach, after } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { installLocalNetworkGuard } from "./emulatorSafety.js";
import { SYNTHETIC_DOCUMENT_IDS } from "./fixtures/syntheticAccounts.js";
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
  harness = await createFirebaseTestHarness("rules");
});

beforeEach(async () => {
  await resetSyntheticState(harness);
  seeded = await seedSyntheticState(harness);
});

after(async () => {
  await harness?.cleanup();
  restoreNetwork?.();
});

test("nicht authentifizierte Zugriffe werden abgewiesen", async () => {
  const db = harness.testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "users", seeded.modernUid)));
  await assertFails(getDocs(collection(db, "trainings")));
});

test("Benutzer darf eigenes Profil lesen, aber Rolle nicht erhöhen", async () => {
  const db = harness.testEnv.authenticatedContext(seeded.modernUid, { role: "spieler" }).firestore();
  await assertSucceeds(getDoc(doc(db, "users", seeded.modernUid)));
  await assertFails(updateDoc(doc(db, "users", seeded.modernUid), { role: "admin" }));
});

test("manipulierte Firestore-Rolle gewährt keine Adminrechte", async () => {
  await harness.testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "users", seeded.modernUid), { role: "admin" });
  });
  const db = harness.testEnv.authenticatedContext(seeded.modernUid, { role: "spieler" }).firestore();
  await assertFails(getDocs(collection(db, "users")));
});

test("Admin-Claim darf Benutzer auflisten", async () => {
  const db = harness.testEnv.authenticatedContext("synthetic-admin", { role: "admin" }).firestore();
  await assertSucceeds(getDocs(collection(db, "users")));
});

test("Passwortfelder dürfen nicht in moderne Profile geschrieben werden", async () => {
  const db = harness.testEnv.authenticatedContext("synthetic-new-user", { role: "spieler" }).firestore();
  await assertFails(setDoc(doc(db, "users", "synthetic-new-user"), {
    uid: "synthetic-new-user",
    email: "new.user@example.invalid",
    username: "synthetic-new-user",
    role: "spieler",
    password: "NeverStore!123"
  }));
});

test("Trainer darf Übungen schreiben, Spieler nicht", async () => {
  const trainerDb = harness.testEnv.authenticatedContext("synthetic-trainer", { role: "trainer" }).firestore();
  const playerDb = harness.testEnv.authenticatedContext(seeded.modernUid, { role: "spieler" }).firestore();
  await assertSucceeds(setDoc(doc(trainerDb, "exercises", "trainer-exercise"), { title: "Synthetic" }));
  await assertFails(setDoc(doc(playerDb, "exercises", "player-exercise"), { title: "Synthetic" }));
});

test("bestehendes Legacy-Profil bleibt über sein UID-Feld lesbar", async () => {
  const db = harness.testEnv.authenticatedContext(seeded.migratedUid, { role: "trainer" }).firestore();
  await assertSucceeds(getDoc(doc(db, "users", SYNTHETIC_DOCUMENT_IDS.migrated)));
});
