import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
  arrayRemove,
  addDoc
} from "firebase/firestore";

const usersList = document.getElementById("users-list");
const trainingsList = document.getElementById("trainings-list");
const exercisesList = document.getElementById("exercises-list");
const reloadBtn = document.getElementById("reload-btn");
const createUserBtn = document.getElementById("create-user-btn");
const createTrainingBtn = document.getElementById("create-training-btn");

reloadBtn.addEventListener("click", loadAll);
createUserBtn.addEventListener("click", createUser);
createTrainingBtn.addEventListener("click", createTraining);

function createDeleteButton(label, onClick) {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function createCard(title, lines = []) {
  const wrapper = document.createElement("div");
  wrapper.style.border = "1px solid #ccc";
  wrapper.style.padding = "10px";
  wrapper.style.marginBottom = "10px";
  wrapper.style.borderRadius = "8px";

  const h3 = document.createElement("h3");
  h3.textContent = title;
  wrapper.appendChild(h3);

  for (const line of lines) {
    const p = document.createElement("p");
    p.textContent = line;
    wrapper.appendChild(p);
  }

  return wrapper;
}

async function loadUsers() {
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
      await loadUsers();
    });

    card.appendChild(deleteBtn);
    usersList.appendChild(card);
  });
}

async function loadTrainings() {
  trainingsList.innerHTML = "";
  const snapshot = await getDocs(collection(db, "trainings"));

  snapshot.forEach((trainingDoc) => {
    const data = trainingDoc.data();
    const exerciseIds = data.exercises || [];

    const card = createCard(`Training: ${data.title || trainingDoc.id}`, [
      `ID: ${trainingDoc.id}`,
      `Altersgruppe: ${data.age_group ?? "-"}`,
      `Dauer: ${data.duration ?? "-"} min`,
      `Benötigte Spieler: ${data.required_players ?? "-"}`,
      `Exercises: ${exerciseIds.length ? exerciseIds.join(", ") : "-"}`
    ]);

    const deleteBtn = createDeleteButton("Training löschen", async () => {
      const confirmed = confirm(`Training ${trainingDoc.id} wirklich löschen?`);
      if (!confirmed) return;

      await deleteDoc(doc(db, "trainings", trainingDoc.id));
      await loadTrainings();
    });

    card.appendChild(deleteBtn);
    trainingsList.appendChild(card);
  });
}

async function loadExercises() {
  exercisesList.innerHTML = "";
  const snapshot = await getDocs(collection(db, "exercises"));

  snapshot.forEach((exerciseDoc) => {
    const data = exerciseDoc.data();

    const coachingPoints = Array.isArray(data.coaching_points)
      ? data.coaching_points.join(", ")
      : (data.coaching_points || "-");

    const card = createCard(`Exercise: ${data.name || exerciseDoc.id}`, [
      `ID: ${exerciseDoc.id}`,
      `Typ: ${data.type || "-"}`,
      `Beschreibung: ${data.description || "-"}`,
      `Coaching Points: ${coachingPoints}`,
      `Dauer: ${data.duration ?? "-"} min`,
      `Bild: ${data.img || "-"}`
    ]);

    const deleteBtn = createDeleteButton("Exercise löschen", async () => {
      const confirmed = confirm(`Exercise ${exerciseDoc.id} wirklich löschen?`);
      if (!confirmed) return;

      await removeExerciseFromAllTrainings(exerciseDoc.id);
      await deleteDoc(doc(db, "exercises", exerciseDoc.id));

      await loadTrainings();
      await loadExercises();
    });

    card.appendChild(deleteBtn);
    exercisesList.appendChild(card);
  });
}

async function removeExerciseFromAllTrainings(exerciseId) {
  const trainingsSnapshot = await getDocs(collection(db, "trainings"));

  for (const trainingDoc of trainingsSnapshot.docs) {
    const data = trainingDoc.data();
    const exerciseIds = data.exercises || [];

    if (exerciseIds.includes(exerciseId)) {
      await updateDoc(doc(db, "trainings", trainingDoc.id), {
        exercises: arrayRemove(exerciseId)
      });
    }
  }
}

// -------- NEU: USER ERSTELLEN --------
async function createUser() {
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

    await loadUsers();
  } catch (error) {
    console.error("Fehler beim Erstellen des Users:", error);
    alert("User konnte nicht erstellt werden.");
  }
}

// -------- NEU: TRAINING ERSTELLEN --------
async function createTraining() {
  const title = prompt("Titel des Trainings:");
  if (!title) return;

  const ageGroup = prompt("Altersgruppe:");
  if (!ageGroup) return;

  const durationInput = prompt("Dauer in Minuten:");
  if (!durationInput) return;

  const requiredPlayersInput = prompt("Benötigte Spieler:");
  if (!requiredPlayersInput) return;

  const duration = Number(durationInput);
  const required_players = Number(requiredPlayersInput);

  if (Number.isNaN(duration) || Number.isNaN(required_players)) {
    alert("Dauer und benötigte Spieler müssen Zahlen sein.");
    return;
  }

  try {
    await addDoc(collection(db, "trainings"), {
      title,
      age_group: ageGroup,
      duration,
      required_players,
      exercises: []
    });

    await loadTrainings();
  } catch (error) {
    console.error("Fehler beim Erstellen des Trainings:", error);
    alert("Training konnte nicht erstellt werden.");
  }
}

async function loadAll() {
  try {
    await loadUsers();
    await loadTrainings();
    await loadExercises();
  } catch (error) {
    console.error("Fehler beim Laden:", error);
    alert("Fehler beim Laden. Schau in die Browser-Konsole.");
  }
}

loadAll();