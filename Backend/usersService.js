import { db, auth } from "./firebase.js";
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  setDoc
} from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { createCard, createDeleteButton } from "./ui.js";

export async function loadUsers(usersList) {
  usersList.innerHTML = "";
  const snapshot = await getDocs(collection(db, "users"));

  snapshot.forEach((userDoc) => {
    const data = userDoc.data();

    const card = createCard(`User: ${data.username || data.name || userDoc.id}`, [
      `ID: ${userDoc.id}`,
      `E-Mail: ${data.email || "-"}`,
      `Club: ${data.club || "-"}`,
      `Rolle: ${data.role || "-"}`
    ]);

    const deleteBtn = createDeleteButton("User löschen", async () => {
      const confirmed = confirm(`User ${userDoc.id} wirklich löschen?`);
      if (!confirmed) return;

      await deleteDoc(doc(db, "users", userDoc.id));
      await loadUsers(usersList);
    });

    card.appendChild(deleteBtn);
    usersList.appendChild(card);
  });
}

export async function createUser(reloadUsers) {
  const username = prompt("Benutzername:");
  if (!username) return;

  const email = prompt("E-Mail:");
  if (!email) return;

  const club = prompt("Verein/Club:");
  if (!club) return;

  const role = prompt("Rolle (admin / staff / player):");
  if (!role) return;

  const password = prompt("Passwort:");
  if (!password) return;

  const passwordRepeat = prompt("Passwort wiederholen:");
  if (!passwordRepeat) return;

  if (password !== passwordRepeat) {
    alert("Die Passwörter stimmen nicht überein.");
    return;
  }

  if (password.length < 6) {
    alert("Das Passwort muss mindestens 6 Zeichen lang sein.");
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    await setDoc(doc(db, "users", uid), {
      uid,
      username,
      email,
      club,
      role
    });

    await reloadUsers();

    alert(
      "User erfolgreich erstellt.\n\nAchtung: Du bist jetzt als der neu erstellte User eingeloggt."
    );
  } catch (error) {
    console.error("Fehler beim Erstellen des Users:", error);
    alert(`User konnte nicht erstellt werden: ${error.message}`);
  }
}