import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  addDoc
} from "firebase/firestore";
import { createCard, createDeleteButton } from "./ui.js";

export async function loadUsers(usersList) {
  usersList.innerHTML = "";
  const snapshot = await getDocs(collection(db, "users"));

  snapshot.forEach((userDoc) => {
    const data = userDoc.data();

    const card = createCard(`User: ${data.username || data.name || userDoc.id}`, [
      `ID: ${userDoc.id}`,
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

  const club = prompt("Verein/Club:");
  if (!club) return;

  const role = prompt("Rolle (admin / trainerteam / spieler):");
  if (!role) return;

  try {
    await addDoc(collection(db, "users"), {
      username,
      club,
      role
    });

    await reloadUsers();
  } catch (error) {
    console.error("Fehler beim Erstellen des Users:", error);
    alert("User konnte nicht erstellt werden.");
  }
}