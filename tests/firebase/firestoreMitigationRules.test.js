import test, { after, before, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc
} from "firebase/firestore";
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
  harness = await createFirebaseTestHarness("mitigation-rules", "firestore.mitigation.rules");
});

beforeEach(async () => {
  await resetSyntheticState(harness);
  seeded = await seedSyntheticState(harness);
});

after(async () => {
  await harness?.cleanup();
  restoreNetwork?.();
});

test("Variante A sperrt anonyme Benutzerprofile einschließlich Passwortprofil", async () => {
  const db = harness.testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "users", seeded.modernUid)));
  await assertFails(getDoc(doc(db, "users", SYNTHETIC_DOCUMENT_IDS.legacyPassword)));
  await assertFails(getDocs(collection(db, "users")));
});

test("Variante A sperrt Benutzerprofile auch für authentifizierte Rollen", async () => {
  const playerDb = harness.testEnv.authenticatedContext(seeded.modernUid, { role: "spieler" }).firestore();
  const adminDb = harness.testEnv.authenticatedContext("synthetic-admin", { role: "admin" }).firestore();
  await assertFails(getDoc(doc(playerDb, "users", seeded.modernUid)));
  await assertFails(getDocs(collection(adminDb, "users")));
});

test("Variante A lässt Trainings anonym und authentifiziert lesen", async () => {
  const anonymousDb = harness.testEnv.unauthenticatedContext().firestore();
  const playerDb = harness.testEnv.authenticatedContext(seeded.modernUid).firestore();
  await assertSucceeds(getDocs(collection(anonymousDb, "trainings")));
  await assertSucceeds(getDoc(doc(playerDb, "trainings", SYNTHETIC_DOCUMENT_IDS.training)));
});

test("Variante A lässt Übungen anonym und authentifiziert lesen", async () => {
  const anonymousDb = harness.testEnv.unauthenticatedContext().firestore();
  const trainerDb = harness.testEnv.authenticatedContext("synthetic-trainer", { role: "trainer" }).firestore();
  await assertSucceeds(getDocs(collection(anonymousDb, "exercises")));
  await assertSucceeds(getDoc(doc(trainerDb, "exercises", SYNTHETIC_DOCUMENT_IDS.exercise)));
});

test("Variante A sperrt sämtliche Benutzer-Schreiboperationen", async () => {
  const db = harness.testEnv.authenticatedContext("synthetic-admin", { role: "admin" }).firestore();
  await assertFails(setDoc(doc(db, "users", "new-user"), { uid: "new-user" }));
  await assertFails(updateDoc(doc(db, "users", seeded.modernUid), { club: "Changed" }));
  await assertFails(deleteDoc(doc(db, "users", seeded.modernUid)));
});

test("Variante A sperrt sämtliche Trainings-Schreiboperationen", async () => {
  const db = harness.testEnv.authenticatedContext("synthetic-admin", { role: "admin" }).firestore();
  await assertFails(addDoc(collection(db, "trainings"), { title: "Denied" }));
  await assertFails(updateDoc(doc(db, "trainings", SYNTHETIC_DOCUMENT_IDS.training), { title: "Denied" }));
  await assertFails(deleteDoc(doc(db, "trainings", SYNTHETIC_DOCUMENT_IDS.training)));
});

test("Variante A sperrt sämtliche Übungs-Schreiboperationen", async () => {
  const db = harness.testEnv.authenticatedContext("synthetic-trainer", { role: "trainer" }).firestore();
  await assertFails(addDoc(collection(db, "exercises"), { title: "Denied" }));
  await assertFails(updateDoc(doc(db, "exercises", SYNTHETIC_DOCUMENT_IDS.exercise), { title: "Denied" }));
  await assertFails(deleteDoc(doc(db, "exercises", SYNTHETIC_DOCUMENT_IDS.exercise)));
});

test("Variante A sperrt unbekannte Collections vollständig", async () => {
  const anonymousDb = harness.testEnv.unauthenticatedContext().firestore();
  const adminDb = harness.testEnv.authenticatedContext("synthetic-admin", { role: "admin" }).firestore();
  await assertFails(getDocs(collection(anonymousDb, "unknown")));
  await assertFails(setDoc(doc(adminDb, "unknown", "document"), { value: true }));
});
