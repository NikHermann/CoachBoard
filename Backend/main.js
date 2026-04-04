import { loadUsers, createUser } from "./usersService.js";
import { loadTrainings, createTraining } from "./trainingsService.js";
import { loadExercises, createExercise } from "./exercisesService.js";

const usersList = document.getElementById("users-list");
const trainingsList = document.getElementById("trainings-list");
const exercisesList = document.getElementById("exercises-list");

const reloadBtn = document.getElementById("reload-btn");
const createUserBtn = document.getElementById("create-user-btn");
const createTrainingBtn = document.getElementById("create-training-btn");
const createExerciseBtn = document.getElementById("create-exercise-btn");

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

loadAll();