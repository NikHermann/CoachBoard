import { auth } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  sendPasswordResetEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  onAuthStateChanged
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

export async function sendOwnPasswordReset() {
  const user = auth.currentUser;

  if (!user || !user.email) {
    throw new Error("Kein Benutzer eingeloggt.");
  }

  await sendPasswordResetEmail(auth, user.email);
}