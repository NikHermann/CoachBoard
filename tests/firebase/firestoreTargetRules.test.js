import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection,
  deleteField,
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
  const claimlessLegacyDb = harness.testEnv.authenticatedContext("legacy-profile-password", {
    email: "legacy.password@example.invalid"
  }).firestore();
  const adminDb = harness.testEnv.authenticatedContext("synthetic-admin", { role: "admin" }).firestore();
  await assertFails(getDoc(doc(legacyDb, "users", SYNTHETIC_DOCUMENT_IDS.legacyPassword)));
  await assertFails(getDoc(doc(claimlessLegacyDb, "users", SYNTHETIC_DOCUMENT_IDS.legacyPassword)));
  await assertFails(getDoc(doc(adminDb, "users", SYNTHETIC_DOCUMENT_IDS.legacyPassword)));
  await assertFails(getDoc(doc(adminDb, "users", SYNTHETIC_DOCUMENT_IDS.legacyNoPassword)));
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
  await assertFails(updateDoc(doc(db, "users", seeded.modernUid), { username: "" }));
  await assertFails(updateDoc(doc(db, "users", seeded.modernUid), { username: 42 }));
  await assertFails(updateDoc(doc(db, "users", seeded.modernUid), { club: "x".repeat(121) }));
});

test("Eigenes kompaktes Raster-Profilbild kann gespeichert, geändert und entfernt werden", async () => {
  const db = harness.testEnv.authenticatedContext(seeded.modernUid, { role: "spieler" }).firestore();
  const jpegAvatar = `data:image/jpeg;base64,${Buffer.alloc(1024, 1).toString("base64")}`;
  const webpAvatar = `data:image/webp;base64,${Buffer.alloc(2048, 2).toString("base64")}`;
  await assertSucceeds(updateDoc(doc(db, "users", seeded.modernUid), { avatarData: jpegAvatar }));
  assert.equal((await getDoc(doc(db, "users", seeded.modernUid))).data().avatarData, jpegAvatar);
  await assertSucceeds(updateDoc(doc(db, "users", seeded.modernUid), { avatarData: webpAvatar }));
  await assertSucceeds(updateDoc(doc(db, "users", seeded.modernUid), { avatarData: deleteField() }));
  assert.equal(Object.hasOwn((await getDoc(doc(db, "users", seeded.modernUid))).data(), "avatarData"), false);
});

test("Avatarregeln sperren falsche Formate, externe Inhalte und übergroße Daten", async () => {
  const db = harness.testEnv.authenticatedContext(seeded.modernUid, { role: "trainer" }).firestore();
  const tooLarge = `data:image/jpeg;base64,${Buffer.alloc(30 * 1024 + 1, 3).toString("base64")}`;
  await assertFails(updateDoc(doc(db, "users", seeded.modernUid), { avatarData: "https://example.invalid/avatar.jpg" }));
  await assertFails(updateDoc(doc(db, "users", seeded.modernUid), { avatarData: "data:image/svg+xml;base64,PHN2Zz4=" }));
  await assertFails(updateDoc(doc(db, "users", seeded.modernUid), { avatarData: "data:text/html;base64,PGgxPk5laW48L2gxPg==" }));
  await assertFails(updateDoc(doc(db, "users", seeded.modernUid), { avatarData: tooLarge }));
  await assertFails(updateDoc(doc(db, "users", seeded.modernUid), { avatarData: 42 }));
});

test("Alle Rollen dürfen nur das Avatarfeld ihres eigenen Profils ändern", async () => {
  const avatar = "data:image/webp;base64,AQIDBA==";
  await harness.testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", "synthetic-admin"), {
      uid: "synthetic-admin",
      email: "admin@example.invalid",
      username: "synthetic-admin",
      club: "Synthetic FC",
      role: "admin"
    });
  });
  const trainerDb = harness.testEnv.authenticatedContext(seeded.migratedUid, {
    role: "trainer",
    profile_id: SYNTHETIC_DOCUMENT_IDS.migrated
  }).firestore();
  const adminDb = harness.testEnv.authenticatedContext("synthetic-admin", { role: "admin" }).firestore();
  await assertSucceeds(updateDoc(doc(trainerDb, "users", SYNTHETIC_DOCUMENT_IDS.migrated), { avatarData: avatar }));
  await assertSucceeds(updateDoc(doc(adminDb, "users", "synthetic-admin"), { avatarData: avatar }));
  await assertFails(updateDoc(doc(trainerDb, "users", seeded.modernUid), { avatarData: avatar }));
  await assertFails(updateDoc(doc(adminDb, "users", seeded.modernUid), { avatarData: avatar }));
});

test("Admin claim does not replace profile ownership or server-side user management", async () => {
  const db = harness.testEnv.authenticatedContext("synthetic-admin", { role: "admin" }).firestore();
  await assertFails(getDoc(doc(db, "users", seeded.modernUid)));
  await assertFails(updateDoc(doc(db, "users", seeded.modernUid), { username: "Admin changed this" }));
  await assertFails(deleteDoc(doc(db, "users", seeded.modernUid)));
});

test("Claimloser neuer Benutzer erstellt ausschließlich sein eigenes Spielerprofil", async () => {
  const uid = "synthetic-new-player";
  const email = "new.player@example.invalid";
  const db = harness.testEnv.authenticatedContext(uid, { email }).firestore();
  const missingProfile = await assertSucceeds(getDoc(doc(db, "users", uid)));
  assert.equal(missingProfile.exists(), false);
  await assertSucceeds(setDoc(doc(db, "users", uid), {
    uid,
    email,
    username: "synthetic-new-player",
    club: "Synthetic FC",
    role: "spieler"
  }));
  await assertFails(setDoc(doc(db, "users", "different-id"), {
    uid,
    email,
    username: "synthetic-new-player",
    club: "Synthetic FC",
    role: "spieler"
  }));
  await assertSucceeds(getDoc(doc(db, "users", uid)));
});

test("Selbstregistrierung kann weder privilegierte Rollen noch geschützte Felder setzen", async () => {
  const uid = "synthetic-registration-attack";
  const email = "registration.attack@example.invalid";
  const profile = { uid, email, username: "synthetic-attacker", club: "Synthetic FC", role: "spieler" };
  const db = harness.testEnv.authenticatedContext(uid, { email }).firestore();
  await assertFails(setDoc(doc(db, "users", uid), { ...profile, role: "admin" }));
  await assertFails(setDoc(doc(db, "users", uid), { ...profile, role: "trainer" }));
  await assertFails(setDoc(doc(db, "users", uid), { ...profile, uid: "foreign-uid" }));
  await assertFails(setDoc(doc(db, "users", uid), { ...profile, email: "foreign@example.invalid" }));
  await assertFails(setDoc(doc(db, "users", uid), { ...profile, admin: true }));
  await assertFails(setDoc(doc(db, "users", uid), { ...profile, password: "never-allowed" }));
  const trainerDb = harness.testEnv.authenticatedContext(uid, { email, role: "trainer" }).firestore();
  const adminDb = harness.testEnv.authenticatedContext(uid, { email, role: "admin" }).firestore();
  await assertFails(setDoc(doc(trainerDb, "users", uid), profile));
  await assertFails(setDoc(doc(adminDb, "users", uid), profile));
});

test("Passwortfeld kann bei Profilerstellung nicht eingeführt werden", async () => {
  const uid = "synthetic-password-attempt";
  const db = harness.testEnv.authenticatedContext(uid, {
    email: "password.attempt@example.invalid"
  }).firestore();
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

test("Bibliothek und vollstÃ¤ndiger Trainings-Lebenszyklus funktionieren mit Zielregeln", async () => {
  const db = harness.testEnv.authenticatedContext(seeded.modernUid, { role: "trainer" }).firestore();

  await assertSucceeds(getDocs(collection(db, "trainings")));
  await assertSucceeds(getDocs(collection(db, "exercises")));
  await assertSucceeds(setDoc(doc(db, "trainings", "trainer-crud-regression"), {
    title: "Trainer lifecycle",
    age_group: "U12",
    required_players: 12,
    duration: 60,
    exercises: [],
    is_template: false,
    created_by_auth_uid: seeded.modernUid,
    created_by_user_id: seeded.modernUid
  }));
  await assertSucceeds(updateDoc(doc(db, "trainings", "trainer-crud-regression"), {
    title: "Trainer lifecycle updated"
  }));
  await assertSucceeds(deleteDoc(doc(db, "trainings", "trainer-crud-regression")));
});

test("Trainingserstellung verlangt die Auth-UID als Eigentümer", async () => {
  const db = harness.testEnv.authenticatedContext(seeded.modernUid, { role: "trainer" }).firestore();
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

test("Spieler schreiben keine Trainings und Mustertrainings bleiben Admins vorbehalten", async () => {
  const playerDb = harness.testEnv.authenticatedContext(seeded.modernUid, { role: "spieler" }).firestore();
  const trainerDb = harness.testEnv.authenticatedContext(seeded.modernUid, { role: "trainer" }).firestore();
  await assertFails(setDoc(doc(playerDb, "trainings", "player-create"), {
    title: "Denied",
    created_by_auth_uid: seeded.modernUid,
    created_by_user_id: seeded.modernUid
  }));
  await assertFails(updateDoc(doc(playerDb, "trainings", "modern-owned-training"), { title: "Denied" }));
  await assertFails(deleteDoc(doc(playerDb, "trainings", "modern-owned-training")));
  await assertFails(setDoc(doc(trainerDb, "trainings", "trainer-template"), {
    title: "Denied template",
    is_template: true,
    created_by_auth_uid: seeded.modernUid,
    created_by_user_id: seeded.modernUid
  }));
});

test("Claimloser Standardspieler liest Trainings, besitzt aber keinerlei Trainings-Schreibrecht", async () => {
  const uid = "claimless-player";
  const db = harness.testEnv.authenticatedContext(uid, {
    email: "claimless.player@example.invalid"
  }).firestore();
  await assertSucceeds(getDocs(collection(db, "trainings")));
  await assertFails(setDoc(doc(db, "trainings", "claimless-create"), {
    title: "Denied",
    created_by_auth_uid: uid,
    created_by_user_id: uid
  }));
  await assertFails(updateDoc(doc(db, "trainings", "modern-owned-training"), { title: "Denied" }));
  await assertFails(deleteDoc(doc(db, "trainings", "modern-owned-training")));
  await assertFails(setDoc(doc(db, "exercises", "claimless-exercise"), { title: "Denied" }));
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
  const db = harness.testEnv.authenticatedContext(seeded.modernUid, { role: "trainer" }).firestore();
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
  await assertSucceeds(setDoc(doc(adminDb, "trainings", "admin-template"), {
    title: "Admin template",
    is_template: true,
    created_by_auth_uid: "synthetic-admin",
    created_by_user_id: "synthetic-admin"
  }));
  await assertSucceeds(updateDoc(doc(adminDb, "trainings", SYNTHETIC_DOCUMENT_IDS.training), { title: "Admin update" }));
  await assertFails(updateDoc(doc(adminDb, "trainings", "modern-owned-training"), {
    created_by_user_id: "transferred-profile"
  }));
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
  await assertSucceeds(deleteDoc(doc(trainerDb, "exercises", "trainer-exercise")));
  await assertSucceeds(updateDoc(doc(adminDb, "exercises", SYNTHETIC_DOCUMENT_IDS.exercise), { title: "Admin" }));
  await assertSucceeds(deleteDoc(doc(adminDb, "exercises", SYNTHETIC_DOCUMENT_IDS.exercise)));
});

test("Unbekannte Collections bleiben für alle Rollen gesperrt", async () => {
  const adminDb = harness.testEnv.authenticatedContext("synthetic-admin", { role: "admin" }).firestore();
  await assertFails(getDocs(collection(adminDb, "unknown")));
  await assertFails(setDoc(doc(adminDb, "unknown", "document"), { value: true }));
  await assertFails(getDocs(collection(adminDb, "trainings", "known", "private")));
  await assertFails(setDoc(doc(adminDb, "trainings", "known", "private", "document"), { value: true }));
});
