import { db, auth } from "./firebase.js";
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  setDoc,
  updateDoc
} from "firebase/firestore";
import { createCard, createDeleteButton } from "./ui.js";
import { createUserWithEmailAndPassword } from "firebase/auth";

// Rendert alle User-Profile aus Firestore
export async function loadUsers(usersList) {
  usersList.innerHTML = "";
  const snapshot = await getDocs(collection(db, "users"));

  snapshot.forEach((userDoc) => {
    const data = userDoc.data();

    const card = createCard(`User: ${data.username || data.name || userDoc.id}`, [
      `ID: ${data.uid || userDoc.id}`,
      `E-Mail: ${data.email || "-"}`,
      `Club: ${data.club || "-"}`,
      `Rolle: ${data.role || "-"}`
    ]);

    const editBtn = document.createElement("button");
    editBtn.textContent = "User bearbeiten";
    editBtn.style.marginRight = "8px";
    editBtn.addEventListener("click", async () => {
      await editUser(userDoc.id, data, () => loadUsers(usersList));
    });

    const deleteBtn = createDeleteButton("User löschen", async () => {
      const confirmed = confirm(`User ${userDoc.id} wirklich löschen?`);
      if (!confirmed) return;

      await deleteDoc(doc(db, "users", userDoc.id));
      await loadUsers(usersList);
    });

    card.appendChild(editBtn);
    card.appendChild(deleteBtn);
    usersList.appendChild(card);
  });
}

async function editUser(userId, currentData, reloadUsers) {
  const username = prompt("Benutzername:", currentData.username || "");
  if (username === null) return;

  const email = prompt("E-Mail:", currentData.email || "");
  if (email === null) return;

  const club = prompt("Verein/Club:", currentData.club || "");
  if (club === null) return;

  const role = prompt("Rolle (admin / staff / player):", currentData.role || "");
  if (role === null) return;

  try {
    await updateDoc(doc(db, "users", userId), {
      username: username.trim(),
      email: email.trim(),
      club: club.trim(),
      role: role.trim()
    });

    await reloadUsers();
  } catch (error) {
    console.error("Fehler beim Bearbeiten des Users:", error);
    alert("User konnte nicht bearbeitet werden.");
  }
}

// Erstellt einen Auth-User mit Passwort und synchronisiert danach das Profil in Firestore
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