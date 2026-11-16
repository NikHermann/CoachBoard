// Isolierter Phase-2-Adapter. Diese Datei wird vom bestehenden main.js nicht importiert.
import { getIdTokenResult } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase.js";
import { login, logout, observeAuth } from "./authService.js";
import { createSecureAuthFlow, SecureAuthError } from "./secureAuthFlow.js";

async function readTokenClaims(user) {
  const token = await getIdTokenResult(user);
  return token.claims || {};
}

async function readProfile(profileId) {
  const snapshot = await getDoc(doc(db, "users", profileId));

  if (!snapshot.exists()) {
    throw new SecureAuthError("profile-missing", "Für dieses Konto ist kein Profil verfügbar.");
  }

  return snapshot.data();
}

export function createInactiveSecureAuthFlow(onStateChange) {
  return createSecureAuthFlow({
    loginWithEmailPassword: login,
    observeAuthState: observeAuth,
    logoutFromAuth: logout,
    readTokenClaims,
    readProfile,
    onStateChange
  });
}
