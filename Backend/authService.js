import { initializeApp, deleteApp } from "firebase/app";
import { auth, firebaseConfig, isLocalAuthTestMode } from "./firebase.js";
import { LOCAL_AUTH_HOST, LOCAL_AUTH_PORT } from "./localAuthTestMode.js";
import {
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  createUserWithEmailAndPassword,
  connectAuthEmulator,
  deleteUser,
  sendPasswordResetEmail,
  sendEmailVerification,
  EmailAuthProvider,
  reauthenticateWithCredential,
  onIdTokenChanged,
  getIdTokenResult,
  reload,
  updateProfile,
  getAuth
} from "firebase/auth";

// Beobachtet, ob sich der Login-Zustand ändert
export function observeAuth(callback) {
  return onIdTokenChanged(auth, callback);
}

// Login mit E-Mail und Passwort
export async function login(email, password) {
  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    throw markFirebasePhase(error, "sign-in");
  }
}

export async function validateCurrentSession() {
  const user = auth.currentUser;
  if (!user) {
    throw Object.assign(new Error("Keine aktive Firebase-Sitzung."), {
      code: "auth/no-current-user"
    });
  }
  try {
    return await getIdTokenResult(user, true);
  } catch (error) {
    throw markFirebasePhase(error, "token-refresh");
  }
}

function markFirebasePhase(error, phase) {
  if (error && typeof error === "object") {
    try {
      Object.defineProperty(error, "phase", {
        value: phase,
        configurable: true,
        enumerable: false
      });
      return error;
    } catch {
      return Object.assign(new Error("Firebase-Vorgang fehlgeschlagen.", { cause: error }), {
        code: error?.code || "internal/unknown",
        phase
      });
    }
  }
  return Object.assign(new Error("Firebase-Vorgang fehlgeschlagen."), {
    code: "internal/non-error-rejection",
    phase
  });
}

// Erstellt einen Auth-Account in einer zweiten Firebase-App, damit der aktuell
// angemeldete Admin im Browser nicht versehentlich ausgeloggt/ersetzt wird.
export async function createAuthAccount(email, password) {
  const appName = `user-create-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const secondaryApp = initializeApp(firebaseConfig, appName);
  const secondaryAuth = getAuth(secondaryApp);
  if (isLocalAuthTestMode) {
    connectAuthEmulator(secondaryAuth, `http://${LOCAL_AUTH_HOST}:${LOCAL_AUTH_PORT}`, { disableWarnings: true });
  }

  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    return credential.user.uid;
  } finally {
    await signOut(secondaryAuth).catch(() => {});
    await deleteApp(secondaryApp).catch(() => {});
  }
}

// Selbstregistrierung erzeugt nur ein Firebase-Auth-Konto. Profil und Rollen-
// Claims werden erst nach Freigabe durch den Spark-Admin-Prozess angelegt.
export async function registerPendingAccount(username, email, password) {
  const appName = `self-register-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const secondaryApp = initializeApp(firebaseConfig, appName);
  const secondaryAuth = getAuth(secondaryApp);
  if (isLocalAuthTestMode) {
    connectAuthEmulator(secondaryAuth, `http://${LOCAL_AUTH_HOST}:${LOCAL_AUTH_PORT}`, { disableWarnings: true });
  }
  let createdUser = null;

  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    createdUser = credential.user;
    await updateProfile(createdUser, { displayName: username });
    await sendEmailVerification(createdUser);
    await signOut(secondaryAuth);
    return Object.freeze({ uid: createdUser.uid, pendingApproval: true });
  } catch (error) {
    if (createdUser) {
      await deleteUser(createdUser).catch(() => {});
    }
    throw markFirebasePhase(error, "registration");
  } finally {
    await signOut(secondaryAuth).catch(() => {});
    await deleteApp(secondaryApp).catch(() => {});
  }
}

// Logout des aktuellen Users
export async function logout() {
  await signOut(auth);
}

// Passwort ändern: dafür verlangt Firebase meist das aktuelle Passwort erneut
export async function changeOwnPassword(currentPassword, newPassword) {
  const user = auth.currentUser;

  if (!user || !user.email) {
    throw new Error("Kein Benutzer eingeloggt.");
  }

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

// Sendet eine Reset-Mail an eine bestimmte E-Mail-Adresse
export async function sendResetMailToEmail(email) {
  if (!email) {
    throw new Error("Keine E-Mail angegeben.");
  }

  await sendPasswordResetEmail(auth, email);
}

// Sendet eine Verifikationsmail an den aktuell eingeloggten User
export async function sendOwnVerificationEmail() {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Kein Benutzer eingeloggt.");
  }

  await sendEmailVerification(user);
}

// Lädt den User neu von Firebase und prüft dann emailVerified
export async function getOwnEmailVerificationStatus() {
  const user = auth.currentUser;

  if (!user) {
    return false;
  }

  await reload(user);
  return user.emailVerified;
}
