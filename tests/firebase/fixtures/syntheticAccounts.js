export const SYNTHETIC_ACCOUNTS = Object.freeze({
  modern: {
    email: "modern.user@example.invalid",
    password: "Modern!Pass123",
    username: "synthetic-modern",
    role: "spieler"
  },
  migrated: {
    email: "migrated.user@example.invalid",
    password: "Migrated!Pass123",
    username: "synthetic-migrated",
    role: "trainer"
  },
  orphanAuth: {
    email: "orphan.auth@example.invalid",
    password: "OrphanAuth!123",
    username: "synthetic-orphan-auth"
  },
  legacyPassword: {
    email: "legacy.password@example.invalid",
    password: "LegacyOnly!123",
    username: "synthetic-legacy-password",
    role: "spieler"
  },
  legacyNoPassword: {
    email: "legacy.no-password@example.invalid",
    username: "synthetic-legacy-no-password",
    role: "spieler"
  },
  missingEmail: {
    username: "synthetic-missing-email",
    role: "spieler"
  },
  duplicate: {
    email: "duplicate.profile@example.invalid",
    username: "synthetic-duplicate",
    role: "spieler"
  }
});

export const SYNTHETIC_DOCUMENT_IDS = Object.freeze({
  migrated: "legacy-profile-migrated",
  legacyPassword: "legacy-profile-password",
  legacyNoPassword: "legacy-profile-no-password",
  missingEmail: "legacy-profile-missing-email",
  duplicateOne: "duplicate-profile-one",
  duplicateTwo: "duplicate-profile-two",
  orphanProfile: "orphan-firestore-profile",
  training: "synthetic-training-reference",
  exercise: "synthetic-exercise"
});
