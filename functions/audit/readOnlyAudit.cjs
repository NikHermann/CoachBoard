"use strict";

const ALLOWED_ROLES = new Set(["spieler", "trainer", "admin"]);

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function analyzeReadOnlyAudit({ authUsers, profiles, trainings, passwordProfileCount }) {
  const authByUid = new Map(authUsers.map((user) => [user.uid, user]));
  const profilesByUid = new Map();
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));

  for (const profile of profiles) {
    const uid = cleanString(profile.uid);
    if (!profilesByUid.has(uid)) profilesByUid.set(uid, []);
    profilesByUid.get(uid).push(profile);
  }

  const uniqueProfileByAuthUid = new Map();
  let uniqueProfileMappings = 0;
  let ambiguousProfileMappings = 0;
  let roleClaimsPresent = 0;
  let roleClaimsMissingOrMismatched = 0;

  for (const user of authUsers) {
    const claimedProfileId = cleanString(user.profileIdClaim);
    const candidates = (profilesByUid.get(user.uid) || []).filter((profile) => {
      return profile.id === user.uid || (claimedProfileId && profile.id === claimedProfileId);
    });

    if (candidates.length === 1) {
      uniqueProfileMappings += 1;
      uniqueProfileByAuthUid.set(user.uid, candidates[0]);
    } else if (candidates.length > 1 || (profilesByUid.get(user.uid) || []).length > 1) {
      ambiguousProfileMappings += 1;
    }

    const roleClaim = cleanString(user.roleClaim).toLowerCase();
    const hasValidClaim = ALLOWED_ROLES.has(roleClaim);
    if (roleClaim) roleClaimsPresent += 1;

    const mappedProfile = candidates.length === 1 ? candidates[0] : null;
    const profileRole = cleanString(mappedProfile?.role).toLowerCase();
    if (!hasValidClaim || (ALLOWED_ROLES.has(profileRole) && profileRole !== roleClaim)) {
      roleClaimsMissingOrMismatched += 1;
    }
  }

  const profilesWithMissingOrConflictingUid = profiles.filter((profile) => {
    const uid = cleanString(profile.uid);
    const authUser = authByUid.get(uid);
    if (!uid || !authUser) return true;

    const claimedProfileId = cleanString(authUser.profileIdClaim);
    return profile.id !== uid && profile.id !== claimedProfileId;
  }).length;

  let trainingsWithLegacyOwnerReference = 0;
  let trainingsWithUnclearOwner = 0;

  for (const training of trainings) {
    const legacyOwnerId = cleanString(training.createdByUserId);
    const authOwnerUid = cleanString(training.createdByAuthUid);
    if (legacyOwnerId) trainingsWithLegacyOwnerReference += 1;

    let ownerIsClear = false;
    if (authOwnerUid && authByUid.has(authOwnerUid)) {
      const mappedProfile = uniqueProfileByAuthUid.get(authOwnerUid);
      ownerIsClear = Boolean(
        mappedProfile && (!legacyOwnerId || legacyOwnerId === mappedProfile.id)
      );
    } else if (legacyOwnerId) {
      const profile = profilesById.get(legacyOwnerId);
      const profileUid = cleanString(profile?.uid);
      ownerIsClear = Boolean(
        profileUid
        && authByUid.has(profileUid)
        && uniqueProfileByAuthUid.get(profileUid)?.id === legacyOwnerId
      );
    }

    if (!ownerIsClear) trainingsWithUnclearOwner += 1;
  }

  return Object.freeze({
    authAccounts: authUsers.length,
    activeAuthAccounts: authUsers.filter((user) => !user.disabled).length,
    disabledAuthAccounts: authUsers.filter((user) => user.disabled).length,
    firestoreProfiles: profiles.length,
    uniqueProfileMappings,
    profilesWithMissingOrConflictingUid,
    profilesWithPasswordField: passwordProfileCount,
    roleClaimsPresent,
    roleClaimsMissingOrMismatched,
    ambiguousProfileMappings,
    trainings: trainings.length,
    trainingsWithLegacyOwnerReference,
    trainingsWithUnclearOwner
  });
}

async function collectReadOnlySnapshot({ auth, firestore }) {
  const authUsers = [];
  let pageToken;
  let authListRequests = 0;

  do {
    const page = await auth.listUsers(1000, pageToken);
    authListRequests += 1;
    for (const user of page.users) {
      authUsers.push({
        uid: user.uid,
        disabled: Boolean(user.disabled),
        roleClaim: user.customClaims?.role,
        profileIdClaim: user.customClaims?.profile_id
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);

  const [profileSnapshot, trainingSnapshot, passwordAggregation] = await Promise.all([
    firestore.collection("users").select("uid", "role").get(),
    firestore.collection("trainings").select("created_by_user_id", "created_by_auth_uid").get(),
    firestore.collection("users").where("password", "!=", null).count().get()
  ]);

  return {
    authUsers,
    profiles: profileSnapshot.docs.map((profile) => ({
      id: profile.id,
      uid: profile.get("uid"),
      role: profile.get("role")
    })),
    trainings: trainingSnapshot.docs.map((training) => ({
      createdByUserId: training.get("created_by_user_id"),
      createdByAuthUid: training.get("created_by_auth_uid")
    })),
    passwordProfileCount: passwordAggregation.data().count,
    readEstimate: {
      authListRequests,
      firestoreProfileDocuments: profileSnapshot.size,
      firestoreTrainingDocuments: trainingSnapshot.size,
      passwordAggregationIndexEntriesAtMost: profileSnapshot.size
    }
  };
}

module.exports = {
  analyzeReadOnlyAudit,
  collectReadOnlySnapshot
};
