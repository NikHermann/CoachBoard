import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc
} from "firebase/firestore";

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();

  if (value === "trainerteam") return "trainer";
  if (value === "admin") return "admin";
  if (value === "trainer") return "trainer";
  return "spieler";
}

function normalizeUser(userDoc) {
  const data = userDoc.data();

  return {
    id: userDoc.id,
    username: data.username || data.name || userDoc.id,
    club: data.club || "TSV Ottensheim",
    role: normalizeRole(data.role),
    password: typeof data.password === "string" ? data.password : ""
  };
}

export async function fetchUsers() {
  const snapshot = await getDocs(collection(db, "users"));

  return snapshot.docs
      .map(normalizeUser)
      .sort((a, b) => a.username.localeCompare(b.username, "de"));
}

export async function createUser(reloadUsers, userData = null) {
  if (userData && typeof userData === "object") {
    const username = String(userData.username || "").trim();
    const club = String(userData.club || "").trim();
    const role = normalizeRole(userData.role);
    const password = String(userData.password || "").trim();

    if (!username || !club || !role) {
      alert("Bitte Benutzername, Verein und Rolle angeben.");
      return null;
    }

    try {
      const docRef = await addDoc(collection(db, "users"), {
        username,
        club,
        role,
        password
      });

      if (typeof reloadUsers === "function") {
        await reloadUsers();
      }

      return {
        id: docRef.id,
        username,
        club,
        role,
        password
      };
    } catch (error) {
      console.error("Fehler beim Erstellen des Users:", error);
      alert("User konnte nicht erstellt werden.");
      return null;
    }
  }

  const username = prompt("Benutzername:");
  if (!username) return null;

  const club = prompt("Verein/Club:");
  if (!club) return null;

  const role = normalizeRole(prompt("Rolle (spieler / trainer / admin):"));
  if (!role) return null;

  const password = prompt("Passwort:") || "";

  try {
    const docRef = await addDoc(collection(db, "users"), {
      username,
      club,
      role,
      password
    });

    if (typeof reloadUsers === "function") {
      await reloadUsers();
    }

    return {
      id: docRef.id,
      username,
      club,
      role,
      password
    };
  } catch (error) {
    console.error("Fehler beim Erstellen des Users:", error);
    alert("User konnte nicht erstellt werden.");
    return null;
  }
}

export async function updateUserProfile(userId, updates, reloadUsers) {
  if (!userId) {
    alert("Benutzer konnte nicht aktualisiert werden.");
    return null;
  }

  const username = String(updates?.username || "").trim();
  const club = updates?.club !== undefined
      ? String(updates.club || "").trim()
      : undefined;
  const password = typeof updates?.password === "string"
      ? updates.password.trim()
      : undefined;
  const role = updates?.role ? normalizeRole(updates.role) : undefined;

  if (!username) {
    alert("Der Benutzername darf nicht leer sein.");
    return null;
  }

  if (club !== undefined && !club) {
    alert("Der Verein darf nicht leer sein.");
    return null;
  }

  const updatePayload = {
    username
  };

  if (club !== undefined) {
    updatePayload.club = club;
  }

  if (password !== undefined) {
    updatePayload.password = password;
  }

  if (role !== undefined) {
    updatePayload.role = role;
  }

  try {
    await updateDoc(doc(db, "users", userId), updatePayload);

    if (typeof reloadUsers === "function") {
      await reloadUsers();
    }

    return updatePayload;
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Profils:", error);
    alert("Profil konnte nicht aktualisiert werden.");
    return null;
  }
}

export async function deleteUser(userId, reloadUsers) {
  if (!userId) {
    alert("Benutzer konnte nicht gelöscht werden.");
    return false;
  }

  try {
    await deleteDoc(doc(db, "users", userId));

    if (typeof reloadUsers === "function") {
      await reloadUsers();
    }

    return true;
  } catch (error) {
    console.error("Fehler beim Löschen des Users:", error);
    alert("User konnte nicht gelöscht werden.");
    return false;
  }
}
