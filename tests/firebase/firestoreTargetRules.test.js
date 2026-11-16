import test, { after, before, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
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
  harness = await createFirebaseTestHarness("target-rules", "firestore.target.rules");
});

beforeEach(async () => {
  await resetSyntheticState(harness);
  seeded = await seedSyntheticState(harness);
  await harness.testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "trainings", "modern-owned-training"), {
      title: "Synthetic modern training",
      created_by_auth_uid: seeded.modernUid,
      created_by_user_id: seeded.modernUid
    });
  });
});

after(async () => {
  await harness?.cleanup();
  restoreNetwork?.();
});

test("Variante B sperrt alle anonymen Zugriffe", async () => {
  const db = harness.testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "users", seeded.modernUid)));
  await assertFails(getDocs(collection(db, "trainings")));
  await assertFails(getDocs(collection(db, "exercises")));
  await assertFails(setDoc(doc(db, "trainings", "anonymous"), { created_by_auth_uid: "anonymous" }));
});

test("Benutzer liest eigenes passwortfreies Profil, aber kein fremdes Profil", async () => {
  const db = harness.testEnv.authenticatedContext(seeded.modernUid, { role: "spieler" }).firestore();
  await assertSucceeds(getDoc(doc(db, "users", seeded.modernUid)));
  await assertFails(getDoc(doc(db, "users", SYNTHETIC_DOCUMENT_IDS.legacyNoPassword)));
  await assertFails(getDocs(collection(db, "users")));
});

test("Legacy-Dokument-ID wird über unverändertes UID-Feld zugeordnet", async () => {
  const db = harness.testEnv.authenticatedContext(seeded.migratedUid, { role: "trainer" }).firestore();
  await assertSucceeds(getDoc(doc(db, "users", SYNTHETIC_DOCUMENT_IDS.migrated)));
});

test("Legacy-Passwortprofil bleibt für Benutzer und Admin gesperrt", async () => {
  const legacyDb = harness.testEnv.authenticatedContext("legacy-profile-password", { role: "spieler" }).firestore();
  const adminDb = harness.testEnv.authenticatedContext("synthetic-admin", { role: "admin" }).firestore();
  await assertFails(getDoc(doc(legacyDb, "users", SYNTHETIC_DOCUMENT_IDS.legacyPassword)));
  await assertFails(getDoc(doc(adminDb, "users", SYNTHETIC_DOCUMENT_IDS.legacyPassword)));
  await assertFails(getDocs(collection(adminDb, "users")));
});

test("Unvollständiges Legacy-Profil ohne sichere UID-Zuordnung bleibt gesperrt", async () => {
  const db = harness.testEnv.authenticatedContext(SYNTHETIC_DOCUMENT_IDS.missingEmail, { role: "spieler" }).firestore();
  await assertFails(getDoc(doc(db, "users", SYNTHETIC_DOCUMENT_IDS.missingEmail)));
});

test("Manipulierte Firestore-Rolle und fehlender Claim erteilen keine Adminrechte", async () => {
  await harness.testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "users", seeded.modernUid), { role: "admin" });
  });
  const db = harness.testEnv.authenticatedContext(seeded.modernUid).firestore();
  await assertFails(getDocs(collection(db, "users")));
  await assertFails(setDoc(doc(db, "exercises", "no-claim"), { title: "Denied" }));
});

test("Falscher Claim erteilt keine Trainer- oder Adminrechte", async () => {
  const db = harness.testEnv.authenticatedContext(seeded.modernUid, { role: "spieler" }).firestore();
  await assertFails(setDoc(doc(db, "exercises", "player-write"), { title: "Denied" }));
  await assertFails(deleteDoc(doc(db, "users", seeded.modernUid)));
});

test("Eigenes Profil erlaubt nur Benutzername und Verein", async () => {
  const db = harness.testEnv.authenticatedContext(seeded.modernUid, { role: "spieler" }).firestore();
  await assertSucceeds(updateDoc(doc(db, "users", seeded.modernUid), { username: "synthetic-renamed" }));
  await assertSucceeds(updateDoc(doc(db, "users", seeded.modernUid), { club: "Synthetic United" }));
  await assertFails(updateDoc(doc(db, "users", seeded.modernUid), { email: "changed@example.invalid" }));
  await assertFails(updateDoc(doc(db, "users", seeded.modernUid), { uid: "changed-uid" }));
  await assertFails(updateDoc(doc(db, "users", seeded.modernUid), { role: "admin" }));
  await assertFails(updateDoc(doc(db, "users", seeded.modernUid), { password: "synthetic-denied-value" }));
});

test("Neue Profile sind auch für authentifizierte Benutzer gesperrt", async () => {
  const uid = "synthetic-new-player";
  const db = harness.testEnv.authenticatedContext(uid, { role: "spieler" }).firestore();
  await assertFails(setDoc(doc(db, "users", uid), {
    uid,
    email: "new.player@example.invalid",
    username: "synthetic-new-player",
    club: "Synthetic FC",
    role: "spieler"
  }));
  await assertFails(setDoc(doc(db, "users", "different-id"), {
    uid,
    email: "new.player@example.invalid",
    username: "synthetic-new-player",
    club: "Synthetic FC",
    role: "spieler"
  }));
  await assertFails(setDoc(doc(db, "users", "synthetic-new-admin"), {
    uid: "synthetic-new-admin",
    email: "new.admin@example.invalid",
    username: "synthetic-new-admin",
    club: "Synthetic FC",
    role: "admin"
  }));
});

test("Passwortfeld kann bei Profilerstellung nicht eingeführt werden", async () => {
  const uid = "synthetic-password-attempt";
  const db = harness.testEnv.authenticatedContext(uid, { role: "spieler" }).firestore();
  await assertFails(setDoc(doc(db, "users", uid), {
    uid,
    email: "password.attempt@example.invalid",
    username: "synthetic-password-attempt",
    club: "Synthetic FC",
    role: "spieler",
    password: "synthetic-denied-value"
  }));
});

test("Authentifizierte Rollen dürfen Trainings lesen", async () => {
  const playerDb = harness.testEnv.authenticatedContext(seeded.modernUid, { role: "spieler" }).firestore();
  const trainerDb = harness.testEnv.authenticatedContext("synthetic-trainer", { role: "trainer" }).firestore();
  const adminDb = harness.testEnv.authenticatedContext("synthetic-admin", { role: "admin" }).firestore();
  await assertSucceeds(getDocs(collection(playerDb, "trainings")));
  await assertSucceeds(getDocs(collection(trainerDb, "trainings")));
  await assertSucceeds(getDocs(collection(adminDb, "trainings")));
});

test("Trainingserstellung verlangt die Auth-UID als Eigentümer", async () => {
  const db = harness.testEnv.authenticatedContext(seeded.modernUid, { role: "spieler" }).firestore();
  await assertSucceeds(setDoc(doc(db, "trainings", "owned-create"), {
    title: "Owned",
    created_by_auth_uid: seeded.modernUid,
    created_by_user_id: seeded.modernUid
  }));
  await assertFails(setDoc(doc(db, "trainings", "foreign-create"), {
    title: "Foreign",
    created_by_auth_uid: "another-user"
  }));
  await assertFails(setDoc(doc(db, "trainings", "legacy-create"), {
    title: "Legacy field only",
    created_by_user_id: seeded.modernUid
  }));
  await assertFails(setDoc(doc(db, "trainings", "mismatched-profile-create"), {
    title: "Mismatched profile",
    created_by_auth_uid: seeded.modernUid,
    created_by_user_id: "foreign-profile"
  }));
});

test("Bestehendes Training bleibt über serverseitig zugeordnetes Legacy-Profil bearbeitbar", async () => {
  const db = harness.testEnv.authenticatedContext(seeded.migratedUid, {
    role: "trainer",
    profile_id: SYNTHETIC_DOCUMENT_IDS.migrated
  }).firestore();
  await harness.testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "trainings", "legacy-profile-owned"), {
      title: "Legacy profile owned",
      created_by_user_id: SYNTHETIC_DOCUMENT_IDS.migrated
    });
  });

  await assertSucceeds(updateDoc(doc(db, "trainings", "legacy-profile-owned"), { title: "Updated" }));
  await assertFails(updateDoc(doc(db, "trainings", "legacy-profile-owned"), {
    created_by_user_id: "foreign-profile"
  }));
  await assertFails(updateDoc(doc(db, "trainings", "legacy-profile-owned"), {
    created_by_auth_uid: seeded.migratedUid
  }));
  await assertSucceeds(deleteDoc(doc(db, "trainings", "legacy-profile-owned")));
});

test("Eigentümer darf eigenes Training ändern und löschen, aber Eigentum nicht übertragen", async () => {
  const db = harness.testEnv.authenticatedContext(seeded.modernUid, { role: "spieler" }).firestore();
  await assertSucceeds(updateDoc(doc(db, "trainings", "modern-owned-training"), { title: "Updated" }));
  await assertFails(updateDoc(doc(db, "trainings", "modern-owned-training"), {
    created_by_auth_uid: "another-user"
  }));
  await assertSucceeds(deleteDoc(doc(db, "trainings", "modern-owned-training")));
});

test("Fremde Trainings und Legacy-Trainings sind für normale Benutzer nicht schreibbar", async () => {
  const db = harness.testEnv.authenticatedContext("another-user", { role: "trainer" }).firestore();
  await assertFails(updateDoc(doc(db, "trainings", "modern-owned-training"), { title: "Denied" }));
  await assertFails(deleteDoc(doc(db, "trainings", "modern-owned-training")));
  await assertFails(updateDoc(doc(db, "trainings", SYNTHETIC_DOCUMENT_IDS.training), { title: "Denied" }));
});

test("Admin-Claim darf Trainings verwalten, Firestore-Profilrolle allein nicht", async () => {
  const adminDb = harness.testEnv.authenticatedContext("synthetic-admin", { role: "admin" }).firestore();
  const profileOnlyDb = harness.testEnv.authenticatedContext(seeded.modernUid, { role: "spieler" }).firestore();
  await assertSucceeds(updateDoc(doc(adminDb, "trainings", SYNTHETIC_DOCUMENT_IDS.training), { title: "Admin update" }));
  await assertSucceeds(deleteDoc(doc(adminDb, "trainings", SYNTHETIC_DOCUMENT_IDS.training)));
  await assertFails(updateDoc(doc(profileOnlyDb, "trainings", "modern-owned-training"), {
    created_by_auth_uid: "another-user"
  }));
});

test("Übungen sind nur authentifiziert lesbar", async () => {
  const anonymousDb = harness.testEnv.unauthenticatedContext().firestore();
  const playerDb = harness.testEnv.authenticatedContext(seeded.modernUid, { role: "spieler" }).firestore();
  await assertFails(getDocs(collection(anonymousDb, "exercises")));
  await assertSucceeds(getDocs(collection(playerDb, "exercises")));
});

test("Nur Trainer- und Admin-Claims dürfen Übungen schreiben", async () => {
  const playerDb = harness.testEnv.authenticatedContext(seeded.modernUid, { role: "spieler" }).firestore();
  const trainerDb = harness.testEnv.authenticatedContext("synthetic-trainer", { role: "trainer" }).firestore();
  const adminDb = harness.testEnv.authenticatedContext("synthetic-admin", { role: "admin" }).firestore();
  await assertFails(setDoc(doc(playerDb, "exercises", "player-exercise"), { title: "Denied" }));
  await assertSucceeds(setDoc(doc(trainerDb, "exercises", "trainer-exercise"), { title: "Allowed" }));
  await assertSucceeds(updateDoc(doc(adminDb, "exercises", SYNTHETIC_DOCUMENT_IDS.exercise), { title: "Admin" }));
});

test("Unbekannte Collections bleiben für alle Rollen gesperrt", async () => {
  const adminDb = harness.testEnv.authenticatedContext("synthetic-admin", { role: "admin" }).firestore();
  await assertFails(getDocs(collection(adminDb, "unknown")));
  await assertFails(setDoc(doc(adminDb, "unknown", "document"), { value: true }));
});
