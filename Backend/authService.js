import { auth } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  EmailAuthProvider,
  reauthenticateWithCredential,
  onAuthStateChanged,
  reload
} from "firebase/auth";

// Beobachtet, ob sich der Login-Zustand ändert
export function observeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

// Login mit E-Mail und Passwort
export async function login(email, password) {
  await signInWithEmailAndPassword(auth, email, password);
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