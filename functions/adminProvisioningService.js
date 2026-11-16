const { createHash, randomUUID } = require("node:crypto");

const ALLOWED_ROLES = new Set(["spieler", "trainer", "admin"]);
const SAFE_PROFILE_ID = /^[A-Za-z0-9_-]{1,1500}$/;
const LOCK_COLLECTION = "_adminProvisioningLocks";

class AdminProvisioningError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "AdminProvisioningError";
    this.code = code;
  }
}

function normalizeEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new AdminProvisioningError("invalid-email", "Ungültige E-Mail-Adresse.");
  }
  return value;
}

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (!ALLOWED_ROLES.has(value)) {
    throw new AdminProvisioningError("invalid-role", "Ungültige oder nicht freigegebene Rolle.");
  }
  return value;
}

function normalizeProfileId(profileId) {
  const value = String(profileId || "").trim();
  if (!SAFE_PROFILE_ID.test(value)) {
    throw new AdminProvisioningError("invalid-profile-id", "Ungültige Profildokument-ID.");
  }
  return value;
}

function normalizeText(value, field, maxLength = 200) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new AdminProvisioningError("invalid-profile-data", `Ungültiges Profilfeld: ${field}.`);
  }
  return normalized;
}

function lockId(kind, value) {
  return `${kind}_${createHash("sha256").update(value).digest("hex")}`;
}

function isUserNotFound(error) {
  return error?.code === "auth/user-not-found";
}

function buildClaims(role, uid, profileId) {
  const claims = { role };
  if (profileId !== uid) {
    claims.profile_id = profileId;
  }
  return claims;
}

function publicUserResult(userRecord, profileId, role) {
  return Object.freeze({
    uid: userRecord.uid,
    email: userRecord.email || "",
    profileId,
    role,
    disabled: Boolean(userRecord.disabled)
  });
}

function createAdminProvisioningService({ auth, firestore, fieldValue, hooks = {} }) {
  if (!auth || !firestore || !fieldValue) {
    throw new TypeError("Auth, Firestore und FieldValue sind erforderlich.");
  }

  async function assertAdminCaller(caller) {
    const uid = String(caller?.uid || "");
    if (!uid || caller?.token?.role !== "admin") {
      throw new AdminProvisioningError("permission-denied", "Administratorberechtigung erforderlich.");
    }

    let adminRecord;
    try {
      adminRecord = await auth.getUser(uid);
    } catch (error) {
      throw new AdminProvisioningError("permission-denied", "Administratorberechtigung ungültig.", {
        cause: error
      });
    }

    if (adminRecord.disabled || adminRecord.customClaims?.role !== "admin") {
      throw new AdminProvisioningError("permission-denied", "Administratorberechtigung nicht aktiv.");
    }

    return adminRecord;
  }

  async function assertEmailAvailable(email) {
    try {
      await auth.getUserByEmail(email);
    } catch (error) {
      if (isUserNotFound(error)) return;
      throw error;
    }
    throw new AdminProvisioningError("email-already-exists", "E-Mail-Adresse ist bereits vergeben.");
  }

  async function acquireLocks(keys, operationId) {
    const refs = keys.map((key) => firestore.collection(LOCK_COLLECTION).doc(key));
    await firestore.runTransaction(async (transaction) => {
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      if (snapshots.some((snapshot) => snapshot.exists)) {
        throw new AdminProvisioningError("operation-conflict", "Eine parallele Verwaltungsaktion ist aktiv.");
      }
      for (const ref of refs) {
        transaction.create(ref, {
          operationId,
          createdAt: fieldValue.serverTimestamp()
        });
      }
    });
  }

  async function releaseLocks(keys, operationId) {
    const refs = keys.map((key) => firestore.collection(LOCK_COLLECTION).doc(key));
    await firestore.runTransaction(async (transaction) => {
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      snapshots.forEach((snapshot, index) => {
        if (snapshot.exists && snapshot.data().operationId === operationId) {
          transaction.delete(refs[index]);
        }
      });
    });
  }

  async function rollbackCreatedUser(uid) {
    if (!uid) return;
    await auth.updateUser(uid, { disabled: true }).catch(() => {});
    await auth.revokeRefreshTokens(uid).catch(() => {});
    await auth.deleteUser(uid).catch(() => {});
  }

  async function createUser(caller, input) {
    await assertAdminCaller(caller);
    const email = normalizeEmail(input?.email);
    const role = normalizeRole(input?.role || "spieler");
    const username = normalizeText(input?.username, "username");
    const club = normalizeText(input?.club, "club");
    const operationId = randomUUID();
    const emailLock = lockId("email", email);
    let uid = null;
    let profileId = null;
    let profileCreated = false;
    const locks = [emailLock];

    await acquireLocks(locks, operationId);
    try {
      await assertEmailAvailable(email);
      await hooks.beforeAuthCreate?.({ email, role, kind: "new" });
      const created = await auth.createUser({ email, emailVerified: false, disabled: true });
      uid = created.uid;
      profileId = uid;

      const profileLock = lockId("profile", profileId);
      await acquireLocks([profileLock], operationId);
      locks.push(profileLock);

      const profileRef = firestore.collection("users").doc(profileId);
      if ((await profileRef.get()).exists) {
        throw new AdminProvisioningError("profile-already-exists", "Profildokument ist bereits belegt.");
      }

      await auth.setCustomUserClaims(uid, buildClaims(role, uid, profileId));
      await hooks.beforeProfileWrite?.({ uid, profileId, kind: "new" });
      await profileRef.create({ uid, email, username, club, role });
      profileCreated = true;
      await auth.updateUser(uid, { disabled: false });
      const result = await auth.getUser(uid);
      return publicUserResult(result, profileId, role);
    } catch (error) {
      if (profileCreated && profileId) {
        await firestore.collection("users").doc(profileId).delete().catch(() => {});
      }
      await rollbackCreatedUser(uid);
      throw error;
    } finally {
      await releaseLocks(locks, operationId).catch(() => {});
    }
  }

  async function linkLegacyProfile(caller, input) {
    await assertAdminCaller(caller);
    if (input?.identityVerified !== true || input?.emailVerified !== true) {
      throw new AdminProvisioningError(
        "identity-verification-required",
        "Identität und E-Mail müssen vor einer Legacy-Zuordnung verifiziert sein."
      );
    }

    const email = normalizeEmail(input.email);
    const profileId = normalizeProfileId(input.profileId);
    const role = normalizeRole(input.role || "spieler");
    const operationId = randomUUID();
    const locks = [lockId("email", email), lockId("profile", profileId)];
    let uid = null;
    let originalProfile = null;
    let profileUpdated = false;

    await acquireLocks(locks, operationId);
    try {
      await assertEmailAvailable(email);
      const profileRef = firestore.collection("users").doc(profileId);
      const profileSnapshot = await profileRef.get();
      if (!profileSnapshot.exists) {
        throw new AdminProvisioningError("profile-not-found", "Legacy-Profil wurde nicht gefunden.");
      }

      originalProfile = profileSnapshot.data();
      if (Object.prototype.hasOwnProperty.call(originalProfile, "password")) {
        throw new AdminProvisioningError(
          "legacy-password-cleanup-required",
          "Legacy-Passwortfeld muss in einem gesondert freigegebenen Verfahren entfernt werden."
        );
      }
      if (originalProfile.uid) {
        throw new AdminProvisioningError("profile-already-linked", "Legacy-Profil ist bereits zugeordnet.");
      }
      if (originalProfile.email && normalizeEmail(originalProfile.email) !== email) {
        throw new AdminProvisioningError("profile-email-conflict", "Profil und verifizierte E-Mail widersprechen sich.");
      }

      await hooks.beforeAuthCreate?.({ email, role, profileId, kind: "legacy" });
      const created = await auth.createUser({ email, emailVerified: true, disabled: true });
      uid = created.uid;
      await auth.setCustomUserClaims(uid, buildClaims(role, uid, profileId));
      await hooks.beforeProfileWrite?.({ uid, profileId, kind: "legacy" });
      await profileRef.update({ uid, email, role });
      profileUpdated = true;
      await auth.updateUser(uid, { disabled: false });
      const result = await auth.getUser(uid);
      return publicUserResult(result, profileId, role);
    } catch (error) {
      if (profileUpdated && originalProfile) {
        await firestore.collection("users").doc(profileId).set(originalProfile, { merge: false }).catch(() => {});
      }
      await rollbackCreatedUser(uid);
      throw error;
    } finally {
      await releaseLocks(locks, operationId).catch(() => {});
    }
  }

  async function resolveProfileForUid(uid) {
    const snapshot = await firestore.collection("users").where("uid", "==", uid).limit(2).get();
    if (snapshot.size !== 1) {
      throw new AdminProvisioningError(
        snapshot.empty ? "profile-not-found" : "duplicate-profile-link",
        "Auth-UID ist nicht eindeutig einem Profil zugeordnet."
      );
    }
    const profile = snapshot.docs[0];
    if (Object.prototype.hasOwnProperty.call(profile.data(), "password")) {
      throw new AdminProvisioningError("legacy-password-cleanup-required", "Passwortprofil bleibt gesperrt.");
    }
    return profile.id;
  }

  async function setRole(caller, targetUid, requestedRole) {
    const admin = await assertAdminCaller(caller);
    const uid = String(targetUid || "");
    const role = normalizeRole(requestedRole);
    if (!uid) throw new AdminProvisioningError("invalid-uid", "Ungültige Auth-UID.");
    if (uid === admin.uid) {
      throw new AdminProvisioningError("self-management-denied", "Eigene Adminrolle darf nicht geändert werden.");
    }

    const target = await auth.getUser(uid);
    const profileId = await resolveProfileForUid(uid);
    const profileRef = firestore.collection("users").doc(profileId);
    const profileSnapshot = await profileRef.get();
    const previousRole = profileSnapshot.data().role;
    const previousClaims = target.customClaims || {};
    let claimsChanged = false;
    let profileChanged = false;

    try {
      await auth.setCustomUserClaims(uid, buildClaims(role, uid, profileId));
      claimsChanged = true;
      await hooks.beforeRoleProfileWrite?.({ uid, profileId, role });
      await profileRef.update({ role });
      profileChanged = true;
      await auth.revokeRefreshTokens(uid);
      return publicUserResult(await auth.getUser(uid), profileId, role);
    } catch (error) {
      if (profileChanged) {
        await profileRef.update({ role: previousRole }).catch(() => {});
      }
      if (claimsChanged) {
        await auth.setCustomUserClaims(uid, previousClaims).catch(() => {});
      }
      throw error;
    }
  }

  async function revokePrivilegedRole(caller, targetUid) {
    return setRole(caller, targetUid, "spieler");
  }

  async function disableUser(caller, targetUid) {
    const admin = await assertAdminCaller(caller);
    const uid = String(targetUid || "");
    if (!uid) throw new AdminProvisioningError("invalid-uid", "Ungültige Auth-UID.");
    if (uid === admin.uid) {
      throw new AdminProvisioningError("self-management-denied", "Eigenes Administratorkonto darf nicht gesperrt werden.");
    }
    await auth.updateUser(uid, { disabled: true });
    await auth.revokeRefreshTokens(uid);
    const result = await auth.getUser(uid);
    return Object.freeze({ uid: result.uid, disabled: result.disabled });
  }

  return Object.freeze({
    createUser,
    linkLegacyProfile,
    setRole,
    revokePrivilegedRole,
    disableUser
  });
}

module.exports = {
  AdminProvisioningError,
  createAdminProvisioningService
};
