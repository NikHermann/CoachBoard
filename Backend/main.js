import { loadUsers, createUser } from "./usersService.js";
import { loadTrainings, createTraining } from "./trainingsService.js";
import { loadExercises, createExercise } from "./exercisesService.js";
import {
  login,
  logout,
  changeOwnPassword,
  sendResetMailToEmail,
  observeAuth
} from "./authService.js";

const usersList = document.getElementById("users-list");
const trainingsList = document.getElementById("trainings-list");
const exercisesList = document.getElementById("exercises-list");

const reloadBtn = document.getElementById("reload-btn");
const createUserBtn = document.getElementById("create-user-btn");
const createTrainingBtn = document.getElementById("create-training-btn");
const createExerciseBtn = document.getElementById("create-exercise-btn");

const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const changePasswordBtn = document.getElementById("change-password-btn");
const resetPasswordBtn = document.getElementById("reset-password-btn");

async function reloadUsers() {
  await loadUsers(usersList);
}

async function reloadTrainings() {
  await loadTrainings(trainingsList);
}

async function reloadExercises() {
  await loadExercises(exercisesList, reloadTrainings);
}

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

reloadBtn.addEventListener("click", loadAll);
createUserBtn.addEventListener("click", () => createUser(reloadUsers));
createTrainingBtn.addEventListener("click", () => createTraining(reloadTrainings));
createExerciseBtn.addEventListener("click", () => createExercise(reloadExercises, reloadTrainings));

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

logoutBtn.addEventListener("click", async () => {
  try {
    await logout();
    alert("Logout erfolgreich.");
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
});

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

observeAuth((user) => {
  console.log("Auth state changed:", user?.email || "kein Login");
});

loadAll();