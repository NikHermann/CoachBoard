// main.js aktiviert diesen Flow im lokalen Emulator- und freigegebenen Produktionsmodus.
import { getIdTokenResult } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db, firebaseConfig } from "./firebase.js";
import { login, logout, observeAuth, validateCurrentSession } from "./authService.js";
import { createSecureAuthFlow, SecureAuthError } from "./secureAuthFlow.js";

export async function readTokenClaims(
  user,
  forceRefresh = true,
  getTokenResult = getIdTokenResult
) {
  try {
    const token = await getTokenResult(user, forceRefresh);
    return token.claims || {};
  } catch (error) {
    throw new SecureAuthError(
      error?.code || "token-refresh-failed",
      "Das Firebase-ID-Token konnte nicht aktualisiert werden.",
      { cause: error, phase: "token-refresh" }
    );
  }
}

export async function readProfile(
  profileId,
  userOrDependencies,
  claims,
  lookup = {},
  injectedDependencies = null
) {
  const dependencies = injectedDependencies
    || (userOrDependencies?.database || userOrDependencies?.getDocument || userOrDependencies?.document
      ? userOrDependencies
      : {});
  const {
    database = db,
    getDocument = getDoc,
    document = doc
  } = dependencies;
  let snapshot;

  try {
    snapshot = await getDocument(document(database, "users", profileId));
  } catch (error) {
    if (error?.code === "permission-denied" || error?.code === "firestore/permission-denied") {
      throw new SecureAuthError(
        "profile-permission-denied",
        "Der Zugriff auf das zugeordnete Profil wurde von Firestore abgewiesen.",
        { cause: error, phase: "profile-load" }
      );
    }

    throw new SecureAuthError(
      "profile-read-failed",
      "Das zugeordnete Profil konnte wegen eines Firebase-Fehlers nicht geladen werden.",
      { cause: error, phase: "profile-load" }
    );
  }

  const diagnostic = Object.freeze({
    claimPresent: Boolean(lookup.claimPresent ?? (typeof claims?.profile_id === "string" && claims.profile_id.trim())),
    source: ["claim", "claim-cache", "uid"].includes(lookup.source) ? lookup.source : "uid",
    exists: snapshot.exists(),
    project: firebaseConfig.projectId,
    database: "(default)"
  });
  console.info("CoachBoard Profil-Diagnose:", diagnostic);

  if (!diagnostic.exists) {
    throw new SecureAuthError(
      "profile-missing",
      "Für dieses Konto ist kein Profil verfügbar.",
      { phase: "profile-load", diagnostic }
    );
  }

  return snapshot.data();
}

export function createSecureAuthAdapter(onStateChange) {
  return createSecureAuthFlow({
    loginWithEmailPassword: login,
    observeAuthState: observeAuth,
    logoutFromAuth: logout,
    validateAuthSession: validateCurrentSession,
    readTokenClaims,
    readProfile,
    onStateChange
  });
}

// Rückwärtskompatibler Name für die bestehenden Phase-2-Tests und Dokumentation.
export const createInactiveSecureAuthFlow = createSecureAuthAdapter;
