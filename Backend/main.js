import { loadUsers, createUser } from "./usersService.js";
import { loadTrainings, createTraining } from "./trainingsService.js";
import { loadExercises, createExercise } from "./exercisesService.js";
import {
  login,
  logout,
  changeOwnPassword,
  sendResetMailToEmail,
  sendOwnVerificationEmail,
  getOwnEmailVerificationStatus,
  observeAuth
} from "./authService.js";

// Haupt-Container aus dem HTML
const usersList = document.getElementById("users-list");
const trainingsList = document.getElementById("trainings-list");
const exercisesList = document.getElementById("exercises-list");

// Buttons für die Datenbankverwaltung
const reloadBtn = document.getElementById("reload-btn");
const createUserBtn = document.getElementById("create-user-btn");
const createTrainingBtn = document.getElementById("create-training-btn");
const createExerciseBtn = document.getElementById("create-exercise-btn");

// Buttons für Auth-Funktionen
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const changePasswordBtn = document.getElementById("change-password-btn");
const resetPasswordBtn = document.getElementById("reset-password-btn");

const verifyEmailBtn = document.getElementById("verify-email-btn");
const checkVerificationBtn = document.getElementById("check-verification-btn");

// Wrapper-Funktionen, damit die Services nur den jeweiligen Bereich neu laden
async function reloadUsers() {
  await loadUsers(usersList);
}

async function reloadTrainings() {
  await loadTrainings(trainingsList);
}

async function reloadExercises() {
  await loadExercises(exercisesList, reloadTrainings);
}

// Lädt alle drei Hauptbereiche der Seite neu
async function loadAll() {
  try {
    await reloadUsers();
    await reloadTrainings();
    await reloadExercises();
  } catch (error) {
    console.error("Fehler beim Laden:", error);
    alert("Fehler beim Laden. Schau in die Browser-Konsole.");
  }
}

// Allgemeine DB-Aktionen
reloadBtn.addEventListener("click", loadAll);
createUserBtn.addEventListener("click", () => createUser(reloadUsers));
createTrainingBtn.addEventListener("click", () => createTraining(reloadTrainings));
createExerciseBtn.addEventListener("click", () => createExercise(reloadExercises, reloadTrainings));

// Login mit E-Mail + Passwort
loginBtn.addEventListener("click", async () => {
  try {
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    await login(email, password);
    alert("Login erfolgreich.");
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
});

// Logout des aktuell eingeloggten Users
logoutBtn.addEventListener("click", async () => {
  try {
    await logout();
    alert("Logout erfolgreich.");
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
});

// Eigenes Passwort ändern
changePasswordBtn.addEventListener("click", async () => {
  try {
    const currentPassword = document.getElementById("current-password").value;
    const newPassword = document.getElementById("new-password").value;

    await changeOwnPassword(currentPassword, newPassword);
    alert("Passwort erfolgreich geändert.");
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
});

// Reset-Mail an die eingegebene Login-E-Mail senden
resetPasswordBtn.addEventListener("click", async () => {
  try {
    const email = document.getElementById("login-email").value.trim();
    await sendResetMailToEmail(email);
    alert("Reset-Mail wurde gesendet.");
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
});

// Verifikationsmail an den aktuell eingeloggten User senden
verifyEmailBtn.addEventListener("click", async () => {
  try {
    await sendOwnVerificationEmail();
    alert("Verifikationsmail wurde gesendet.");
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
});

// Prüft, ob die E-Mail des aktuellen Users bereits bestätigt wurde
checkVerificationBtn.addEventListener("click", async () => {
  try {
    const verified = await getOwnEmailVerificationStatus();
    alert(verified ? "E-Mail ist verifiziert." : "E-Mail ist noch nicht verifiziert.");
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
});

// Reagiert auf Login/Logout-Wechsel
observeAuth((user) => {
  console.log("Auth state changed:", user?.email || "kein Login");
});

// Initiales Laden der Seite
loadAll();