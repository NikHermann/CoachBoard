import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
  addDoc
} from "firebase/firestore";
import { createActionButton, createCard, createDeleteButton } from "./ui.js";

// Unterstützt alte und neue Feldnamen für Übungen im Training
export function getTrainingExerciseIds(trainingData) {
  if (Array.isArray(trainingData.exerciseIDs)) {
    return trainingData.exerciseIDs;
  }

  if (Array.isArray(trainingData.exercises)) {
    return trainingData.exercises;
  }

  return [];
}

// Summiert die Dauer aller im Training enthaltenen Exercises
export function calculateTrainingDuration(exerciseIds, exerciseMap) {
  return exerciseIds.reduce((sum, exerciseId) => {
    const exercise = exerciseMap.get(exerciseId);
    return sum + Number(exercise?.duration || 0);
  }, 0);
}

// Speichert die Exercise-Zuordnung und aktualisiert gleichzeitig die Dauer
async function saveTrainingExercises(trainingId, exerciseIds) {
  const exercisesSnapshot = await getDocs(collection(db, "exercises"));
  const exerciseMap = new Map();

  exercisesSnapshot.forEach((exerciseDoc) => {
    exerciseMap.set(exerciseDoc.id, exerciseDoc.data());
  });

  const duration = calculateTrainingDuration(exerciseIds, exerciseMap);

  await updateDoc(doc(db, "trainings", trainingId), {
    exerciseIDs: exerciseIds,
    duration
  });
}

export async function addExerciseToTraining(trainingId, currentExerciseIds, exerciseId) {
  if (!exerciseId) return;
  if (currentExerciseIds.includes(exerciseId)) return;

  const nextExerciseIds = [...currentExerciseIds, exerciseId];
  await saveTrainingExercises(trainingId, nextExerciseIds);
}

export async function removeExerciseFromTraining(trainingId, currentExerciseIds, exerciseId) {
  const nextExerciseIds = currentExerciseIds.filter((id) => id !== exerciseId);
  await saveTrainingExercises(trainingId, nextExerciseIds);
}

// Wird benötigt, wenn eine Exercise komplett gelöscht wird
export async function removeExerciseFromAllTrainings(exerciseId) {
  const [trainingsSnapshot, exercisesSnapshot] = await Promise.all([
    getDocs(collection(db, "trainings")),
    getDocs(collection(db, "exercises"))
  ]);

  const exerciseMap = new Map();

  exercisesSnapshot.forEach((exerciseDoc) => {
    if (exerciseDoc.id !== exerciseId) {
      exerciseMap.set(exerciseDoc.id, exerciseDoc.data());
    }
  });

  for (const trainingDoc of trainingsSnapshot.docs) {
    const data = trainingDoc.data();
    const exerciseIds = getTrainingExerciseIds(data);

    if (exerciseIds.includes(exerciseId)) {
      const nextExerciseIds = exerciseIds.filter((id) => id !== exerciseId);
      const nextDuration = calculateTrainingDuration(nextExerciseIds, exerciseMap);

      const updateData = {
        duration: nextDuration
      };

      if (Array.isArray(data.exerciseIDs)) {
        updateData.exerciseIDs = nextExerciseIds;
      }

      if (Array.isArray(data.exercises)) {
        updateData.exercises = nextExerciseIds;
      }

      await updateDoc(doc(db, "trainings", trainingDoc.id), updateData);
    }
  }
}

// Rendert alle Trainings und deren Exercise-Zuordnung
export async function loadTrainings(trainingsList) {
  trainingsList.innerHTML = "";

  const [trainingsSnapshot, exercisesSnapshot] = await Promise.all([
    getDocs(collection(db, "trainings")),
    getDocs(collection(db, "exercises"))
  ]);

  const exerciseMap = new Map();
  const allExercises = [];

  exercisesSnapshot.forEach((exerciseDoc) => {
    const exerciseData = exerciseDoc.data();

    exerciseMap.set(exerciseDoc.id, exerciseData);
    allExercises.push({
      id: exerciseDoc.id,
      ...exerciseData
    });
  });

  trainingsSnapshot.forEach((trainingDoc) => {
    const data = trainingDoc.data();
    const exerciseIds = getTrainingExerciseIds(data);
    const calculatedDuration = calculateTrainingDuration(exerciseIds, exerciseMap);

    const card = createCard(`Training: ${data.title || trainingDoc.id}`, [
      `ID: ${trainingDoc.id}`,
      `Altersgruppe: ${data.age_group ?? "-"}`,
      `Dauer: ${calculatedDuration} min`,
      `Benötigte Spieler: ${data.required_players ?? "-"}`
    ]);

    const exercisesTitle = document.createElement("h4");
    exercisesTitle.textContent = "Exercises in this training:";
    exercisesTitle.style.marginTop = "10px";
    card.appendChild(exercisesTitle);

    if (exerciseIds.length === 0) {
      const emptyText = document.createElement("p");
      emptyText.textContent = "No exercises in this training";
      card.appendChild(emptyText);
    } else {
      exerciseIds.forEach((exerciseId) => {
        const exerciseData = exerciseMap.get(exerciseId);

        const row = document.createElement("div");
        row.style.marginBottom = "8px";

        const label = document.createElement("span");
        label.textContent = exerciseData
          ? `${exerciseData.name || exerciseId} (${exerciseData.duration ?? 0} min)`
          : exerciseId;

        const removeBtn = createActionButton("Aus Training entfernen", async () => {
          try {
            await removeExerciseFromTraining(trainingDoc.id, exerciseIds, exerciseId);
            await loadTrainings(trainingsList);
          } catch (error) {
            console.error("Fehler beim Entfernen der Exercise aus dem Training:", error);
            alert("Exercise konnte nicht aus dem Training entfernt werden.");
          }
        });

        row.appendChild(label);
        row.appendChild(document.createTextNode(" "));
        row.appendChild(removeBtn);
        card.appendChild(row);
      });
    }

    const addSectionTitle = document.createElement("h4");
    addSectionTitle.textContent = "Exercise hinzufügen:";
    addSectionTitle.style.marginTop = "14px";
    card.appendChild(addSectionTitle);

    if (allExercises.length === 0) {
      const noExercisesText = document.createElement("p");
      noExercisesText.textContent = "Es gibt aktuell keine Exercises in der Datenbank.";
      card.appendChild(noExercisesText);
    } else {
      const availableExercises = allExercises.filter(
        (exercise) => !exerciseIds.includes(exercise.id)
      );

      if (availableExercises.length === 0) {
        const noAvailableText = document.createElement("p");
        noAvailableText.textContent = "Alle vorhandenen Exercises sind bereits in diesem Training.";
        card.appendChild(noAvailableText);
      } else {
        const select = document.createElement("select");
        select.style.marginTop = "10px";
        select.style.marginRight = "8px";

        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "-- Exercise auswählen --";
        select.appendChild(defaultOption);

        availableExercises.forEach((exercise) => {
          const option = document.createElement("option");
          option.value = exercise.id;
          option.textContent = `${exercise.name || exercise.id} (${exercise.duration ?? 0} min)`;
          select.appendChild(option);
        });

        const addBtn = createActionButton("Exercise hinzufügen", async () => {
          const selectedExerciseId = select.value;

          if (!selectedExerciseId) {
            alert("Bitte zuerst eine Exercise auswählen.");
            return;
          }

          try {
            await addExerciseToTraining(trainingDoc.id, exerciseIds, selectedExerciseId);
            await loadTrainings(trainingsList);
          } catch (error) {
            console.error("Fehler beim Hinzufügen der Exercise zum Training:", error);
            alert("Exercise konnte nicht zum Training hinzugefügt werden.");
          }
        });

        card.appendChild(select);
        card.appendChild(addBtn);
      }
    }

    const deleteBtn = createDeleteButton("Training löschen", async () => {
      const confirmed = confirm(`Training ${trainingDoc.id} wirklich löschen?`);
      if (!confirmed) return;

      await deleteDoc(doc(db, "trainings", trainingDoc.id));
      await loadTrainings(trainingsList);
    });

    card.appendChild(document.createElement("br"));
    card.appendChild(document.createElement("br"));
    card.appendChild(deleteBtn);

    trainingsList.appendChild(card);
  });
}

// Neues Training anlegen
export async function createTraining(reloadTrainings) {
  const title = prompt("Titel des Trainings:");
  if (!title) return;

  const ageGroup = prompt("Altersgruppe:");
  if (!ageGroup) return;

  const requiredPlayersInput = prompt("Benötigte Spieler:");
  if (!requiredPlayersInput) return;

  const required_players = Number(requiredPlayersInput);

  if (Number.isNaN(required_players)) {
    alert("Benötigte Spieler müssen eine Zahl sein.");
    return;
  }

  try {
    await addDoc(collection(db, "trainings"), {
      title,
      age_group: ageGroup,
      duration: 0,
      required_players,
      exerciseIDs: []
    });

    await reloadTrainings();
  } catch (error) {
    console.error("Fehler beim Erstellen des Trainings:", error);
    alert("Training konnte nicht erstellt werden.");
  }
}