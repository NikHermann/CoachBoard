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

export function observeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function login(email, password) {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  await signOut(auth);
}

export async function changeOwnPassword(currentPassword, newPassword) {
  const user = auth.currentUser;

  if (!user || !user.email) {
    throw new Error("Kein Benutzer eingeloggt.");
  }

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

export async function sendResetMailToEmail(email) {
  if (!email) {
    throw new Error("Keine E-Mail angegeben.");
  }

  await sendPasswordResetEmail(auth, email);
}

export async function sendOwnVerificationEmail() {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Kein Benutzer eingeloggt.");
  }

  await sendEmailVerification(user);
}

export async function getOwnEmailVerificationStatus() {
  const user = auth.currentUser;

  if (!user) {
    return false;
  }

  await reload(user);
  return user.emailVerified;
}