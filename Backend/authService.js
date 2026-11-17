import { initializeApp, deleteApp } from "firebase/app";
import { auth, db, firebaseConfig, isLocalAuthTestMode } from "./firebase.js";
import { LOCAL_AUTH_HOST, LOCAL_AUTH_PORT } from "./localAuthTestMode.js";
import {
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  createUserWithEmailAndPassword,
  connectAuthEmulator,
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
import { doc, getDoc, setDoc } from "firebase/firestore";

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

// Selbstregistrierung erzeugt ein claimloses Auth-Konto und genau dessen
// eigenes, streng begrenztes Spielerprofil.
export async function registerPlayerAccount(username, email, password, club = "TSV Ottensheim") {
  try {
    let credential;
    try {
      credential = await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      if (error?.code !== "auth/email-already-in-use") throw error;
      credential = await signInWithEmailAndPassword(auth, email, password);
    }

    const user = credential.user;
    const authenticatedEmail = String(user.email || "").trim().toLowerCase();
    if (!authenticatedEmail) {
      throw Object.assign(new Error("Das Auth-Konto besitzt keine E-Mail-Adresse."), {
        code: "auth/missing-email"
      });
    }

    await updateProfile(user, { displayName: username });
    const profileRef = doc(db, "users", user.uid);
    const existing = await getDoc(profileRef);
    if (existing.exists()) {
      const profile = existing.data();
      if (profile.uid !== user.uid
          || String(profile.email || "").trim().toLowerCase() !== authenticatedEmail
          || profile.role !== "spieler") {
        throw Object.assign(new Error("Das vorhandene Profil ist nicht sicher zuordenbar."), {
          code: "registration/profile-conflict"
        });
      }
    } else {
      await setDoc(profileRef, {
        uid: user.uid,
        email: authenticatedEmail,
        username: String(username || "").trim(),
        club: String(club || "").trim(),
        role: "spieler"
      });
    }

    return Object.freeze({ uid: user.uid, user, role: "spieler" });
  } catch (error) {
    throw markFirebasePhase(error, "registration");
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
