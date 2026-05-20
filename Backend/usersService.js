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

function getUsernameValidationError(username) {
  const value = String(username || "").trim();

  if (!value) {
    return "Der Benutzername darf nicht leer sein.";
  }

  if (/\s/.test(value)) {
    return "Der Benutzername darf keine Leerzeichen enthalten.";
  }

  return "";
}

function getPasswordValidationError(password) {
  const value = String(password || "");

  if (value.length < 8) {
    return "Das Passwort muss mindestens 8 Zeichen lang sein.";
  }

  const hasNumber = /\d/.test(value);
  const hasUppercase = /[A-ZÄÖÜ]/.test(value);
  const hasSpecialChar = /[^A-Za-zÄÖÜäöüß0-9\s]/.test(value);
  const fulfilledRules = [hasNumber, hasUppercase, hasSpecialChar].filter(Boolean).length;

  if (fulfilledRules < 2) {
    return "Das Passwort muss mindestens 2 von 3 Kriterien erfüllen: Zahl, Sonderzeichen, Großbuchstabe.";
  }

  return "";
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

    const usernameError = getUsernameValidationError(username);
    if (usernameError) {
      alert(usernameError);
      return null;
    }

    const passwordError = getPasswordValidationError(password);
    if (passwordError) {
      alert(passwordError);
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

  const username = String(prompt("Benutzername:") || "").trim();
  if (!username) return null;

  const club = String(prompt("Verein/Club:") || "").trim();
  if (!club) return null;

  const role = normalizeRole(prompt("Rolle (spieler / trainer / admin):"));
  if (!role) return null;

  const password = String(prompt("Passwort:") || "").trim();

  const usernameError = getUsernameValidationError(username);
  if (usernameError) {
    alert(usernameError);
    return null;
  }

  const passwordError = getPasswordValidationError(password);
  if (passwordError) {
    alert(passwordError);
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

export async function updateUserProfile(userId, updates, reloadUsers) {
  if (!userId) {
    alert("Benutzer konnte nicht aktualisiert werden.");
    return null;
  }

  const username = updates?.username !== undefined
      ? String(updates.username || "").trim()
      : undefined;
  const club = updates?.club !== undefined
      ? String(updates.club || "").trim()
      : undefined;
  const password = typeof updates?.password === "string"
      ? updates.password.trim()
      : undefined;
  const role = updates?.role ? normalizeRole(updates.role) : undefined;

  if (username !== undefined) {
    const usernameError = getUsernameValidationError(username);
    if (usernameError) {
      alert(usernameError);
      return null;
    }
  }

  if (club !== undefined && !club) {
    alert("Der Verein darf nicht leer sein.");
    return null;
  }

  if (password !== undefined) {
    const passwordError = getPasswordValidationError(password);
    if (passwordError) {
      alert(passwordError);
      return null;
    }
  }

  const updatePayload = {};

  if (username !== undefined) {
    updatePayload.username = username;
  }

  if (club !== undefined) {
    updatePayload.club = club;
  }

  if (password !== undefined) {
    updatePayload.password = password;
  }

  if (role !== undefined) {
    updatePayload.role = role;
  }

  if (Object.keys(updatePayload).length === 0) {
    alert("Es wurden keine Änderungen angegeben.");
    return null;
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
