export function classifyProfiles(profiles, authUids) {
  const authSet = new Set(authUids);
  const emailCounts = new Map();
  const usernameCounts = new Map();
  const result = {
    modern: 0,
    migrated: 0,
    legacyWithPassword: 0,
    legacyWithoutPassword: 0,
    missingEmail: 0,
    duplicateEmailGroups: 0,
    duplicateUsernameGroups: 0,
    orphanProfiles: 0,
    orphanAuthAccounts: 0
  };

  for (const profile of profiles) {
    const data = profile.data;
    const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    const username = typeof data.username === "string" ? data.username.trim().toLowerCase() : "";

    if (!email) result.missingEmail += 1;
    if (email) emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
    if (username) usernameCounts.set(username, (usernameCounts.get(username) || 0) + 1);

    if (typeof data.uid === "string" && data.uid) {
      if (!authSet.has(data.uid)) result.orphanProfiles += 1;
      if (profile.id === data.uid) result.modern += 1;
      else result.migrated += 1;
    } else if (typeof data.password === "string") {
      result.legacyWithPassword += 1;
    } else {
      result.legacyWithoutPassword += 1;
    }
  }

  result.duplicateEmailGroups = [...emailCounts.values()].filter((count) => count > 1).length;
  result.duplicateUsernameGroups = [...usernameCounts.values()].filter((count) => count > 1).length;

  const profileUids = new Set(profiles.map(({ data }) => data.uid).filter(Boolean));
  result.orphanAuthAccounts = [...authSet].filter((uid) => !profileUids.has(uid)).length;
  return result;
}
