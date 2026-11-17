const ALLOWED_ROLES = new Set(["spieler", "trainer", "admin"]);
const SAFE_PROFILE_ID = /^[A-Za-z0-9_-]{1,1500}$/;

export class SecureAuthError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "SecureAuthError";
    this.code = code;
    this.phase = options.phase || null;
    this.diagnostic = options.diagnostic || null;
  }
}

export function getLoginErrorMessage(error) {
  switch (error?.code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
      return "Die Anmeldedaten sind ungültig. Bitte E-Mail-Adresse und Passwort erneut eingeben.";
    case "auth/wrong-password":
      return "Das eingegebene Passwort ist nicht korrekt.";
    case "auth/invalid-email":
    case "invalid-email":
      return "Bitte eine gültige E-Mail-Adresse eingeben.";
    case "missing-password":
    case "auth/missing-password":
      return "Bitte ein Passwort eingeben.";
    case "auth/user-disabled":
      return "Dieses Benutzerkonto ist deaktiviert.";
    case "auth/too-many-requests":
      return "Zu viele Anmeldeversuche. Bitte später erneut versuchen oder das Passwort zurücksetzen.";
    case "auth/network-request-failed":
      return "Firebase Authentication ist derzeit nicht erreichbar. Bitte die Netzwerkverbindung prüfen.";
    case "auth/operation-not-allowed":
      return "Die E-Mail-/Passwort-Anmeldung ist für dieses Firebase-Projekt nicht aktiviert.";
    case "auth/email-already-in-use":
      return "Für diese E-Mail-Adresse besteht bereits ein Konto.";
    case "auth/weak-password":
      return "Das Passwort erfüllt die Firebase-Sicherheitsanforderungen nicht.";
    default:
      return "Die Anmeldung ist wegen eines unerwarteten Firebase-Fehlers fehlgeschlagen.";
  }
}

const SAFE_DIAGNOSTIC_VALUE = /^[a-z0-9][a-z0-9/_-]{0,80}$/i;

export function getSafeAuthDiagnostic(error, fallbackPhase = "internal") {
  const phase = SAFE_DIAGNOSTIC_VALUE.test(String(error?.phase || ""))
    ? String(error.phase)
    : fallbackPhase;
  const code = SAFE_DIAGNOSTIC_VALUE.test(String(error?.code || ""))
    ? String(error.code)
    : "internal/unknown";
  return Object.freeze({ phase, code });
}

export function getSafeProfileDiagnostic(error) {
  const diagnostic = error?.diagnostic;
  if (!diagnostic || typeof diagnostic !== "object") return null;

  const source = ["claim", "claim-cache", "uid"].includes(diagnostic.source)
    ? diagnostic.source
    : "unknown";
  return Object.freeze({
    claimPresent: diagnostic.claimPresent === true,
    source,
    exists: diagnostic.exists === true,
    project: diagnostic.project === "coachboarddb" ? "coachboarddb" : "unexpected",
    database: diagnostic.database === "(default)" ? "(default)" : "unexpected"
  });
}

const INVALID_SESSION_CODES = new Set([
  "auth/id-token-expired",
  "auth/invalid-user-token",
  "auth/user-token-expired",
  "auth/user-disabled",
  "auth/no-current-user"
]);

export function getSessionErrorMessage(error) {
  if (error?.code === "auth/network-request-failed") {
    return "Die Sitzung konnte wegen eines Netzwerkfehlers nicht geprüft werden. Die Aktion wurde nicht ausgeführt.";
  }
  if (INVALID_SESSION_CODES.has(error?.code) || error?.code === "session-invalid") {
    return "Die Firebase-Sitzung ist nicht mehr gültig. Bitte erneut anmelden.";
  }
  return "Die Firebase-Sitzung konnte nicht sicher bestätigt werden. Bitte erneut anmelden.";
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

function getProfileResolution(user, claims, previousClaimProfileId = "") {
  const claimedProfileId = typeof claims?.profile_id === "string"
    ? claims.profile_id.trim()
    : "";
  const cachedProfileId = String(previousClaimProfileId || "").trim();
  const profileId = claimedProfileId || cachedProfileId || String(user?.uid || "");
  const source = claimedProfileId ? "claim" : cachedProfileId ? "claim-cache" : "uid";

  if (!SAFE_PROFILE_ID.test(profileId)) {
    throw new SecureAuthError(
      "invalid-profile-id",
      "Die serverseitige Profilzuordnung ist ungültig."
    );
  }

  return Object.freeze({
    profileId,
    claimPresent: Boolean(claimedProfileId),
    source
  });
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
    validateAuthSession = async () => true,
    readTokenClaims,
    readProfile,
    onStateChange = () => {}
  } = dependencies || {};

  for (const [name, dependency] of Object.entries({
    loginWithEmailPassword,
    observeAuthState,
    logoutFromAuth,
    readTokenClaims,
    readProfile,
    validateAuthSession
  })) {
    if (typeof dependency !== "function") {
      throw new TypeError(`Fehlende Auth-Abhängigkeit: ${name}`);
    }
  }

  let disposed = false;
  let generation = 0;
  let unsubscribe = null;
  let validationPromise = null;
  let observedUid = null;
  let authStateInFlight = null;
  let authStateInFlightUid = null;
  let startupInFlight = null;
  let resolveStartup = null;
  let manualLoginRequested = false;
  let registrationInProgress = false;
  const startupReady = new Promise((resolve) => {
    resolveStartup = resolve;
  });
  const claimProfileIds = new Map();
  let state = Object.freeze({ status: "idle", user: null, profile: null, role: null, error: null });

  function publish(nextState) {
    if (disposed) return;
    state = Object.freeze(nextState);
    onStateChange(state);
  }

  async function handleAuthState(user, forceRefresh = false) {
    const currentGeneration = ++generation;

    if (!user) {
      observedUid = null;
      claimProfileIds.clear();
      publish({ status: "signed-out", user: null, profile: null, role: null, error: null });
      return;
    }

    publish({ status: "loading-profile", user, profile: null, role: null, error: null });

    try {
      const claims = await readTokenClaims(user, forceRefresh);
      const resolution = getProfileResolution(user, claims, claimProfileIds.get(user.uid));
      if (resolution.claimPresent) {
        claimProfileIds.set(user.uid, resolution.profileId);
      }
      const rawProfile = await readProfile(
          resolution.profileId,
          user,
          claims,
          { claimPresent: resolution.claimPresent, source: resolution.source }
      );
      const profile = sanitizeProfile(rawProfile, user, resolution.profileId);

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
        : INVALID_SESSION_CODES.has(error?.code)
          ? new SecureAuthError("session-invalid", getSessionErrorMessage(error), {
            cause: error,
            phase: error?.phase || "token-refresh"
          })
          : error?.code === "auth/network-request-failed"
            ? new SecureAuthError("session-check-network", getSessionErrorMessage(error), {
              cause: error,
              phase: error?.phase || "token-refresh"
            })
            : new SecureAuthError("profile-load-failed", "Das geschützte Profil konnte nicht geladen werden.", {
              cause: error,
              phase: error?.phase || "profile-load"
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
          // Persistierte Firebase-Sitzungen werden beim Seitenstart verworfen,
          // ohne Claims, Profile oder geschÃ¼tzte Daten zu laden.
          if (!startupInFlight) {
            startupInFlight = (async () => {
              ++generation;
              manualLoginRequested = false;
              if (user) await logoutFromAuth().catch(() => {});
              publish({ status: "signed-out", user: null, profile: null, role: null, error: null });
              resolveStartup?.();
              resolveStartup = null;
            })();
            return;
          }

          if (!manualLoginRequested) {
            ++generation;
            if (user) void logoutFromAuth().catch(() => {});
            publish({ status: "signed-out", user: null, profile: null, role: null, error: null });
            return;
          }

          if (registrationInProgress) return;

          const nextUid = String(user?.uid || "");
          const forceRefresh = Boolean(nextUid && nextUid !== observedUid);
          observedUid = nextUid || null;

          // Ein erzwungener Token-Refresh löst onIdTokenChanged erneut aus.
          // Derselbe Benutzer wird bereits mit dem frischen Token verarbeitet;
          // ein konkurrierender Callback dürfte diesen Profilabruf sonst verwerfen.
          if (authStateInFlight && nextUid === authStateInFlightUid) return;

          authStateInFlightUid = nextUid;
          authStateInFlight = {};
          const current = handleAuthState(user, forceRefresh);
          authStateInFlight = current;
          void current.finally(() => {
            if (authStateInFlight === current) {
              authStateInFlight = null;
              authStateInFlightUid = null;
            }
          });
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

      await startupReady;
      manualLoginRequested = true;
      try {
        return await loginWithEmailPassword(normalizedEmail, password);
      } catch (error) {
        manualLoginRequested = false;
        await logoutFromAuth().catch(() => {});
        throw error;
      }
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

    async registerWithProfile(registerAccount) {
      if (typeof registerAccount !== "function") {
        throw new TypeError("Registrierungsfunktion fehlt.");
      }

      await startupReady;
      manualLoginRequested = true;
      registrationInProgress = true;
      try {
        const registration = await registerAccount();
        const user = registration?.user;
        if (!user?.uid) {
          throw new SecureAuthError("registration-user-missing", "Das neue Auth-Konto ist nicht verfügbar.");
        }

        observedUid = user.uid;
        await handleAuthState(user, true);
        registrationInProgress = false;
        if (state.status !== "authenticated") {
          throw state.error || new SecureAuthError(
            "registration-profile-load-failed",
            "Das Spielerprofil konnte nach der Registrierung nicht geladen werden."
          );
        }
        return registration;
      } catch (error) {
        registrationInProgress = false;
        manualLoginRequested = false;
        await logoutFromAuth().catch(() => {});
        throw error;
      }
    },

    async logout() {
      ++generation;
      manualLoginRequested = false;
      registrationInProgress = false;
      publish({ status: "signed-out", user: null, profile: null, role: null, error: null });
      await logoutFromAuth();
    },

    async validateSession() {
      if (validationPromise) return validationPromise;

      validationPromise = (async () => {
        try {
          await validateAuthSession();
          return true;
        } catch (error) {
          if (error?.code === "auth/network-request-failed") {
            throw new SecureAuthError("session-check-network", getSessionErrorMessage(error), {
              cause: error,
              phase: error?.phase || "token-refresh"
            });
          }

          const sessionError = new SecureAuthError("session-invalid", getSessionErrorMessage(error), {
            cause: error,
            phase: error?.phase || "token-refresh"
          });
          publish({ status: "error", user: null, profile: null, role: null, error: sessionError });
          await logoutFromAuth().catch(() => {});
          throw sessionError;
        } finally {
          validationPromise = null;
        }
      })();

      return validationPromise;
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
      authStateInFlight = null;
      authStateInFlightUid = null;
      claimProfileIds.clear();
      manualLoginRequested = false;
      registrationInProgress = false;
      resolveStartup?.();
      resolveStartup = null;
    }
  });
}
