import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  createUserWithEmailAndPassword,
  getIdTokenResult,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { installLocalNetworkGuard } from "./emulatorSafety.js";
import {
  createFirebaseTestHarness,
  resetSyntheticState
} from "./testFirebase.js";

const require = createRequire(import.meta.url);
const {
  AdminProvisioningError,
  createAdminProvisioningService
} = require("../../functions/adminProvisioningService.js");
const {
  createEmulatorAdminProvisioning
} = require("../../functions/adminProvisioningEmulator.js");

const SYNTHETIC_PASSWORD = "Synthetic-Phase3!2026";
let harness;
let adminSdk;
let service;
let caller;
let restoreNetwork;

async function seedAdmin() {
  const admin = await adminSdk.auth.createUser({
    email: "phase3.admin@example.invalid",
    emailVerified: true
  });
  await adminSdk.auth.setCustomUserClaims(admin.uid, { role: "admin" });
  await adminSdk.firestore.collection("users").doc(admin.uid).set({
    uid: admin.uid,
    email: admin.email,
    username: "synthetic-phase3-admin",
    club: "Synthetic FC",
    role: "admin"
  });
  return { uid: admin.uid, token: { role: "admin" } };
}

async function expectAuthUserMissing(email) {
  await assert.rejects(() => adminSdk.auth.getUserByEmail(email), (error) => {
    return error?.code === "auth/user-not-found";
  });
}

async function createPasswordAccount(email, role = "spieler") {
  const credential = await createUserWithEmailAndPassword(harness.auth, email, SYNTHETIC_PASSWORD);
  const uid = credential.user.uid;
  await signOut(harness.auth);
  await adminSdk.auth.setCustomUserClaims(uid, { role });
  await adminSdk.firestore.collection("users").doc(uid).set({
    uid,
    email,
    username: `synthetic-${uid.slice(0, 8)}`,
    club: "Synthetic FC",
    role
  });
  return uid;
}

function createServiceWithHooks(hooks) {
  return createAdminProvisioningService({
    auth: adminSdk.auth,
    firestore: adminSdk.firestore,
    fieldValue: adminSdk.fieldValue,
    hooks
  });
}

before(async () => {
  restoreNetwork = installLocalNetworkGuard();
  harness = await createFirebaseTestHarness("admin-provisioning", "firestore.target.rules");
  adminSdk = createEmulatorAdminProvisioning();
  service = adminSdk.service;
});

beforeEach(async () => {
  await resetSyntheticState(harness);
  caller = await seedAdmin();
});

after(async () => {
  await harness?.cleanup();
  restoreNetwork?.();
});

test("berechtigter Administrator erstellt deaktiviert-gesichert ein vollständiges Spielerkonto", async () => {
  const result = await service.createUser(caller, {
    email: "new.player@example.invalid",
    username: "synthetic-new-player",
    club: "Synthetic FC",
    role: "spieler"
  });

  assert.equal(result.profileId, result.uid);
  assert.equal(result.role, "spieler");
  assert.equal(result.disabled, false);
  const user = await adminSdk.auth.getUser(result.uid);
  assert.deepEqual(user.customClaims, { role: "spieler" });
  const profile = await adminSdk.firestore.collection("users").doc(result.uid).get();
  assert.equal(profile.data().uid, result.uid);
  assert.equal(Object.hasOwn(profile.data(), "password"), false);
});

test("Selbstregistrierung bleibt bis zur verifizierten Spark-Admin-Freigabe ohne Profil und Claims", async () => {
  const pending = await adminSdk.auth.createUser({
    email: "pending.registration@example.invalid",
    password: SYNTHETIC_PASSWORD,
    displayName: "synthetic-pending",
    emailVerified: false
  });

  assert.deepEqual((await adminSdk.auth.getUser(pending.uid)).customClaims || {}, {});
  assert.equal((await adminSdk.firestore.collection("users").doc(pending.uid).get()).exists, false);
  await assert.rejects(() => service.approvePendingUser(caller, {
    uid: pending.uid,
    username: "synthetic-pending",
    club: "Synthetic FC",
    role: "trainer"
  }), { code: "pending-email-not-verified" });

  await adminSdk.auth.updateUser(pending.uid, { emailVerified: true });
  const approved = await service.approvePendingUser(caller, {
    uid: pending.uid,
    username: "synthetic-pending",
    club: "Synthetic FC",
    role: "trainer"
  });

  assert.equal(approved.role, "trainer");
  assert.deepEqual((await adminSdk.auth.getUser(pending.uid)).customClaims, { role: "trainer" });
  const profile = await adminSdk.firestore.collection("users").doc(pending.uid).get();
  assert.equal(profile.data().uid, pending.uid);
  assert.equal(Object.hasOwn(profile.data(), "password"), false);
});

test("nicht berechtigter und nur clientseitig manipulierter Benutzer wird abgewiesen", async () => {
  const uid = await createPasswordAccount("ordinary.user@example.invalid", "spieler");
  await adminSdk.firestore.collection("users").doc(uid).update({ role: "admin" });

  await assert.rejects(
    () => service.createUser({ uid, token: { role: "admin" } }, {
      email: "denied.user@example.invalid",
      username: "synthetic-denied",
      club: "Synthetic FC",
      role: "admin"
    }),
    (error) => error instanceof AdminProvisioningError && error.code === "permission-denied"
  );
  await expectAuthUserMissing("denied.user@example.invalid");
});

test("Rollen spieler, trainer und admin werden nur serverseitig gesetzt", async () => {
  const created = await service.createUser(caller, {
    email: "roles.user@example.invalid",
    username: "synthetic-roles",
    club: "Synthetic FC",
    role: "spieler"
  });

  for (const role of ["trainer", "admin", "spieler"]) {
    const changed = await service.setRole(caller, created.uid, role);
    assert.equal(changed.role, role);
    assert.equal((await adminSdk.auth.getUser(created.uid)).customClaims.role, role);
    assert.equal((await adminSdk.firestore.collection("users").doc(created.profileId).get()).data().role, role);
  }

  const revoked = await service.revokePrivilegedRole(caller, created.uid);
  assert.equal(revoked.role, "spieler");
});

test("Rollenänderung erhält fremde vorhandene Custom Claims", async () => {
  const uid = await createPasswordAccount("claims.preserved@example.invalid", "spieler");
  await adminSdk.auth.setCustomUserClaims(uid, { role: "spieler", feature_flag: "retained" });

  await service.setRole(caller, uid, "trainer");

  assert.deepEqual((await adminSdk.auth.getUser(uid)).customClaims, {
    role: "trainer",
    feature_flag: "retained"
  });
});

test("eigene Adminrolle und eigenes Administratorkonto können nicht verändert werden", async () => {
  await assert.rejects(() => service.setRole(caller, caller.uid, "spieler"), {
    code: "self-management-denied"
  });
  await assert.rejects(() => service.disableUser(caller, caller.uid), {
    code: "self-management-denied"
  });
});

test("Legacy-Profil behält Dokument-ID und erhält sichere Auth-UID-Zuordnung", async () => {
  const profileId = "legacy-phase3-profile";
  await adminSdk.firestore.collection("users").doc(profileId).set({
    email: "legacy.phase3@example.invalid",
    username: "synthetic-legacy-phase3",
    club: "Synthetic FC",
    role: "spieler"
  });

  const linked = await service.linkLegacyProfile(caller, {
    profileId,
    email: "legacy.phase3@example.invalid",
    role: "trainer",
    identityVerified: true,
    emailVerified: true
  });

  assert.equal(linked.profileId, profileId);
  assert.notEqual(linked.uid, profileId);
  const profile = await adminSdk.firestore.collection("users").doc(profileId).get();
  assert.equal(profile.data().uid, linked.uid);
  assert.deepEqual((await adminSdk.auth.getUser(linked.uid)).customClaims, {
    role: "trainer",
    profile_id: profileId
  });
});

test("Legacy-Zuordnung verlangt Identitätsnachweis und lehnt Passwortprofile ab", async () => {
  const profileId = "legacy-unverified-profile";
  await adminSdk.firestore.collection("users").doc(profileId).set({
    email: "legacy.unverified@example.invalid",
    username: "synthetic-unverified",
    role: "spieler"
  });
  await assert.rejects(() => service.linkLegacyProfile(caller, {
    profileId,
    email: "legacy.unverified@example.invalid",
    role: "spieler",
    identityVerified: false,
    emailVerified: true
  }), { code: "identity-verification-required" });

  await adminSdk.firestore.collection("users").doc(profileId).set({
    email: "legacy.unverified@example.invalid",
    username: "synthetic-unverified",
    role: "spieler",
    password: "synthetic-value-never-copied"
  });
  await assert.rejects(() => service.linkLegacyProfile(caller, {
    profileId,
    email: "legacy.unverified@example.invalid",
    role: "spieler",
    identityVerified: true,
    emailVerified: true
  }), { code: "legacy-password-cleanup-required" });
  await expectAuthUserMissing("legacy.unverified@example.invalid");
});

test("doppelte E-Mail und widersprüchliche Profilzuordnungen brechen sicher ab", async () => {
  await adminSdk.auth.createUser({ email: "duplicate.phase3@example.invalid" });
  await assert.rejects(() => service.createUser(caller, {
    email: "duplicate.phase3@example.invalid",
    username: "synthetic-duplicate",
    club: "Synthetic FC",
    role: "spieler"
  }), { code: "email-already-exists" });

  const linkedUid = "synthetic-existing-link";
  await adminSdk.firestore.collection("users").doc("legacy-linked").set({
    uid: linkedUid,
    email: "linked.profile@example.invalid",
    username: "synthetic-linked",
    role: "spieler"
  });
  await assert.rejects(() => service.linkLegacyProfile(caller, {
    profileId: "legacy-linked",
    email: "linked.profile@example.invalid",
    role: "spieler",
    identityVerified: true,
    emailVerified: true
  }), { code: "profile-already-linked" });
  await expectAuthUserMissing("linked.profile@example.invalid");
});

test("fehlgeschlagene Kontoerstellung hinterlässt weder Konto noch Sperre", async () => {
  const failing = createServiceWithHooks({
    beforeAuthCreate: async () => {
      throw new Error("synthetic auth creation failure");
    }
  });
  const email = "failed.auth@example.invalid";
  await assert.rejects(() => failing.createUser(caller, {
    email,
    username: "synthetic-failed-auth",
    club: "Synthetic FC",
    role: "spieler"
  }), /synthetic auth creation failure/);
  await expectAuthUserMissing(email);
  assert.equal((await adminSdk.firestore.collection("_adminProvisioningLocks").get()).empty, true);
});

test("fehlgeschlagener Profilwrite rollt neu erstelltes Auth-Konto zurück", async () => {
  const failing = createServiceWithHooks({
    beforeProfileWrite: async () => {
      throw new Error("synthetic profile failure");
    }
  });
  const email = "failed.profile@example.invalid";
  await assert.rejects(() => failing.createUser(caller, {
    email,
    username: "synthetic-failed-profile",
    club: "Synthetic FC",
    role: "spieler"
  }), /synthetic profile failure/);
  await expectAuthUserMissing(email);
  assert.equal((await adminSdk.firestore.collection("users").where("email", "==", email).get()).empty, true);
  assert.equal((await adminSdk.firestore.collection("_adminProvisioningLocks").get()).empty, true);
});

test("fehlgeschlagene Rollenprofiländerung stellt Claims und Profilrolle wieder her", async () => {
  const created = await service.createUser(caller, {
    email: "failed.role@example.invalid",
    username: "synthetic-failed-role",
    club: "Synthetic FC",
    role: "spieler"
  });
  const failing = createServiceWithHooks({
    beforeRoleProfileWrite: async () => {
      throw new Error("synthetic role profile failure");
    }
  });
  await assert.rejects(() => failing.setRole(caller, created.uid, "admin"), /synthetic role profile failure/);
  assert.equal((await adminSdk.auth.getUser(created.uid)).customClaims.role, "spieler");
  assert.equal((await adminSdk.firestore.collection("users").doc(created.profileId).get()).data().role, "spieler");
});

test("parallele Erstellung derselben Identität erzeugt höchstens ein Konto", async () => {
  const input = {
    email: "parallel.user@example.invalid",
    username: "synthetic-parallel",
    club: "Synthetic FC",
    role: "spieler"
  };
  const results = await Promise.allSettled([
    service.createUser(caller, input),
    service.createUser(caller, input)
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const accounts = await adminSdk.auth.listUsers();
  assert.equal(accounts.users.filter((user) => user.email === input.email).length, 1);
});

test("gesperrter Benutzer kann sich nicht neu anmelden", async () => {
  const email = "disabled.phase3@example.invalid";
  const uid = await createPasswordAccount(email);
  const disabled = await service.disableUser(caller, uid);
  assert.equal(disabled.disabled, true);
  await assert.rejects(
    () => signInWithEmailAndPassword(harness.auth, email, SYNTHETIC_PASSWORD),
    /auth\/(user-disabled|invalid-credential)/
  );
});

test("Rollenänderung wird nach Token-Aktualisierung wirksam und altes Token bleibt nicht Quelle neuer Rechte", async () => {
  const email = "token.refresh@example.invalid";
  const uid = await createPasswordAccount(email, "spieler");
  const credential = await signInWithEmailAndPassword(harness.auth, email, SYNTHETIC_PASSWORD);
  const oldToken = await getIdTokenResult(credential.user);
  assert.equal(oldToken.claims.role, "spieler");

  await service.setRole(caller, uid, "trainer");
  const cachedToken = await getIdTokenResult(credential.user);
  assert.equal(cachedToken.claims.role, "spieler");
  const refreshedToken = await getIdTokenResult(credential.user, true);
  assert.equal(refreshedToken.claims.role, "trainer");

  await service.revokePrivilegedRole(caller, uid);
  const cachedPrivilegedToken = await getIdTokenResult(credential.user);
  assert.equal(cachedPrivilegedToken.claims.role, "trainer");
  const refreshedDowngradedToken = await getIdTokenResult(credential.user, true);
  assert.equal(refreshedDowngradedToken.claims.role, "spieler");
  await signOut(harness.auth);
});

test("Legacy-Zuordnung verändert keine Trainings- oder Übungsreferenzen", async () => {
  const profileId = "legacy-reference-profile";
  const trainingId = "phase3-training-reference";
  const exerciseId = "phase3-exercise-reference";
  await adminSdk.firestore.collection("users").doc(profileId).set({
    email: "legacy.reference@example.invalid",
    username: "synthetic-reference",
    role: "spieler"
  });
  await adminSdk.firestore.collection("trainings").doc(trainingId).set({
    title: "Synthetic reference",
    created_by_user_id: profileId,
    exerciseIDs: [exerciseId]
  });
  await adminSdk.firestore.collection("exercises").doc(exerciseId).set({
    title: "Synthetic exercise reference"
  });
  const trainingBefore = (await adminSdk.firestore.collection("trainings").doc(trainingId).get()).data();
  const exerciseBefore = (await adminSdk.firestore.collection("exercises").doc(exerciseId).get()).data();

  await service.linkLegacyProfile(caller, {
    profileId,
    email: "legacy.reference@example.invalid",
    role: "spieler",
    identityVerified: true,
    emailVerified: true
  });

  assert.deepEqual((await adminSdk.firestore.collection("trainings").doc(trainingId).get()).data(), trainingBefore);
  assert.deepEqual((await adminSdk.firestore.collection("exercises").doc(exerciseId).get()).data(), exerciseBefore);
});

test("Admin-SDK-Adapter verweigert fehlende Emulatorisolation", async () => {
  const originalProject = process.env.GCLOUD_PROJECT;
  process.env.GCLOUD_PROJECT = "coachboarddb";
  try {
    const { assertEmulatorIsolation } = require("../../functions/adminProvisioningEmulator.js");
    assert.throws(() => assertEmulatorIsolation(), /nur für das freigegebene Demo-Projekt/);
  } finally {
    process.env.GCLOUD_PROJECT = originalProject;
  }
});

test("Admin listet, bearbeitet, sperrt und reaktiviert bestehende Benutzer serverseitig", async () => {
  const uid = await createPasswordAccount("managed.user@example.invalid", "spieler");
  const unlinked = await adminSdk.auth.createUser({ email: "unlinked.user@example.invalid" });
  const listed = await service.listUsers(caller);
  assert.equal(listed.some((user) => user.uid === uid && user.email === "managed.user@example.invalid"), true);
  assert.equal(listed.some((user) => user.uid === unlinked.uid && user.mappingStatus === "profile-not-found"), true);

  const updated = await service.updateUser(caller, {
    uid,
    username: "synthetic-managed-renamed",
    club: "Synthetic United",
    role: "trainer"
  });
  assert.equal(updated.role, "trainer");
  assert.equal(updated.username, "synthetic-managed-renamed");
  assert.equal((await adminSdk.auth.getUser(uid)).customClaims.role, "trainer");

  assert.equal((await service.disableUser(caller, uid)).disabled, true);
  assert.equal((await service.reactivateUser(caller, uid)).disabled, false);
});

test("kontrolliertes Löschen schützt Selbstkonto und bestehende Trainingsreferenzen", async () => {
  const referencedUid = await createPasswordAccount("referenced.user@example.invalid", "trainer");
  await adminSdk.firestore.collection("trainings").doc("managed-reference").set({
    created_by_user_id: referencedUid,
    created_by_auth_uid: referencedUid
  });
  await assert.rejects(() => service.deleteUser(caller, referencedUid), {
    code: "user-has-training-references"
  });
  assert.equal((await adminSdk.auth.getUser(referencedUid)).uid, referencedUid);

  const deletableUid = await createPasswordAccount("deletable.user@example.invalid", "spieler");
  assert.deepEqual(await service.deleteUser(caller, deletableUid), { uid: deletableUid, deleted: true });
  await assert.rejects(() => adminSdk.auth.getUser(deletableUid), { code: "auth/user-not-found" });
  assert.equal((await adminSdk.firestore.collection("users").doc(deletableUid).get()).exists, false);
  await assert.rejects(() => service.deleteUser(caller, caller.uid), { code: "self-management-denied" });
});

test("bestehendes Auth-Konto wird ohne Neuanlage sicher mit einem Profil verknüpft", async () => {
  const existing = await adminSdk.auth.createUser({ email: "existing.link@example.invalid" });
  await adminSdk.firestore.collection("users").doc("existing-profile-id").set({
    email: existing.email,
    username: "synthetic-existing-link",
    club: "Synthetic FC",
    role: "spieler"
  });
  const linked = await service.linkExistingUser(caller, {
    uid: existing.uid,
    profileId: "existing-profile-id",
    role: "trainer",
    identityVerified: true
  });
  assert.equal(linked.uid, existing.uid);
  assert.equal(linked.profileId, "existing-profile-id");
  assert.deepEqual((await adminSdk.auth.getUser(existing.uid)).customClaims, {
    role: "trainer",
    profile_id: "existing-profile-id"
  });
  assert.equal(
    (await adminSdk.firestore.collection("users").doc("existing-profile-id").get()).data().uid,
    existing.uid
  );
});
