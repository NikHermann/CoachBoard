const ALLOWED_ROLES = new Set(["spieler", "trainer", "admin"]);
const SAFE_PROFILE_ID = /^[A-Za-z0-9_-]{1,1500}$/;

export class SecureAuthError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "SecureAuthError";
    this.code = code;
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getVerifiedRole(claims) {
  const claimedRole = typeof claims?.role === "string"
    ? claims.role.trim().toLowerCase()
    : "";

  return ALLOWED_ROLES.has(claimedRole) ? claimedRole : "spieler";
}

function getProfileId(user, claims) {
  const claimedProfileId = typeof claims?.profile_id === "string"
    ? claims.profile_id.trim()
    : "";
  const profileId = claimedProfileId || String(user?.uid || "");

  if (!SAFE_PROFILE_ID.test(profileId)) {
    throw new SecureAuthError(
      "invalid-profile-id",
      "Die serverseitige Profilzuordnung ist ungültig."
    );
  }

  return profileId;
}

function sanitizeProfile(profile, user, profileId) {
  if (!profile || typeof profile !== "object") {
    throw new SecureAuthError("profile-missing", "Für dieses Konto ist kein Profil verfügbar.");
  }

  if (Object.prototype.hasOwnProperty.call(profile, "password")) {
    throw new SecureAuthError(
      "legacy-password-profile-blocked",
      "Dieses Legacy-Profil muss vor der Anmeldung sicher umgestellt werden."
    );
  }

  if (profile.uid !== user.uid) {
    throw new SecureAuthError(
      "profile-uid-mismatch",
      "Das Profil ist nicht eindeutig dem Auth-Konto zugeordnet."
    );
  }

  return Object.freeze({
    id: profileId,
    uid: user.uid,
    email: typeof profile.email === "string" ? profile.email : user.email || "",
    username: typeof profile.username === "string" ? profile.username : "",
    club: typeof profile.club === "string" ? profile.club : ""
  });
}

export function createSecureAuthFlow(dependencies) {
  const {
    loginWithEmailPassword,
    observeAuthState,
    logoutFromAuth,
    readTokenClaims,
    readProfile,
    onStateChange = () => {}
  } = dependencies || {};

  for (const [name, dependency] of Object.entries({
    loginWithEmailPassword,
    observeAuthState,
    logoutFromAuth,
    readTokenClaims,
    readProfile
  })) {
    if (typeof dependency !== "function") {
      throw new TypeError(`Fehlende Auth-Abhängigkeit: ${name}`);
    }
  }

  let disposed = false;
  let generation = 0;
  let unsubscribe = null;
  let state = Object.freeze({ status: "idle", user: null, profile: null, role: null, error: null });

  function publish(nextState) {
    if (disposed) return;
    state = Object.freeze(nextState);
    onStateChange(state);
  }

  async function handleAuthState(user) {
    const currentGeneration = ++generation;

    if (!user) {
      publish({ status: "signed-out", user: null, profile: null, role: null, error: null });
      return;
    }

    publish({ status: "loading-profile", user, profile: null, role: null, error: null });

    try {
      const claims = await readTokenClaims(user);
      const profileId = getProfileId(user, claims);
      const rawProfile = await readProfile(profileId, user, claims);
      const profile = sanitizeProfile(rawProfile, user, profileId);

      if (disposed || currentGeneration !== generation) return;

      publish({
        status: "authenticated",
        user,
        profile,
        role: getVerifiedRole(claims),
        error: null
      });
    } catch (error) {
      if (disposed || currentGeneration !== generation) return;

      const safeError = error instanceof SecureAuthError
        ? error
        : new SecureAuthError("profile-load-failed", "Das geschützte Profil konnte nicht geladen werden.", {
          cause: error
        });

      publish({ status: "error", user: null, profile: null, role: null, error: safeError });
      await logoutFromAuth().catch(() => {});
    }
  }

  return Object.freeze({
    start() {
      if (disposed) {
        throw new SecureAuthError("flow-disposed", "Der Auth-Ablauf wurde bereits beendet.");
      }

      if (!unsubscribe) {
        unsubscribe = observeAuthState((user) => {
          void handleAuthState(user);
        });
      }

      return () => this.dispose();
    },

    async loginWithEmail(email, password) {
      const normalizedEmail = normalizeEmail(email);

      if (!isEmail(normalizedEmail)) {
        throw new SecureAuthError("invalid-email", "Bitte eine gültige E-Mail-Adresse eingeben.");
      }

      if (typeof password !== "string" || password.length === 0) {
        throw new SecureAuthError("missing-password", "Bitte ein Passwort eingeben.");
      }

      return loginWithEmailPassword(normalizedEmail, password);
    },

    async loginWithIdentifier(identifier, password) {
      const normalizedIdentifier = String(identifier || "").trim();

      if (!isEmail(normalizedIdentifier)) {
        throw new SecureAuthError(
          "username-login-requires-backend",
          "Benutzernamen-Login benötigt einen geschützten serverseitigen Resolver."
        );
      }

      return this.loginWithEmail(normalizedIdentifier, password);
    },

    async logout() {
      ++generation;
      await logoutFromAuth();
    },

    getState() {
      return state;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      ++generation;
      unsubscribe?.();
      unsubscribe = null;
    }
  });
}
