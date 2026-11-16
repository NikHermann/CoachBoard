// main.js aktiviert diesen Flow im lokalen Emulator- und freigegebenen Produktionsmodus.
import { getIdTokenResult } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase.js";
import { login, logout, observeAuth, validateCurrentSession } from "./authService.js";
import { createSecureAuthFlow, SecureAuthError } from "./secureAuthFlow.js";

export async function readTokenClaims(
  user,
  forceRefresh = true,
  getTokenResult = getIdTokenResult
) {
  const token = await getTokenResult(user, forceRefresh);
  return token.claims || {};
}

export async function readProfile(
  profileId,
  { database = db, getDocument = getDoc, document = doc } = {}
) {
  let snapshot;

  try {
    snapshot = await getDocument(document(database, "users", profileId));
  } catch (error) {
    if (error?.code === "permission-denied" || error?.code === "firestore/permission-denied") {
      throw new SecureAuthError(
        "profile-permission-denied",
        "Der Zugriff auf das zugeordnete Profil wurde von Firestore abgewiesen.",
        { cause: error }
      );
    }

    throw new SecureAuthError(
      "profile-read-failed",
      "Das zugeordnete Profil konnte wegen eines Firebase-Fehlers nicht geladen werden.",
      { cause: error }
    );
  }

  if (!snapshot.exists()) {
    throw new SecureAuthError("profile-missing", "Für dieses Konto ist kein Profil verfügbar.");
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
