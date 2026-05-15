import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  deleteDoc
} from "firebase/firestore";

function toSafeString(value) {
  return String(value ?? "").trim();
}

function parseDurationToNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const text = toSafeString(value);
  if (!text) return 0;

  const match = text.match(/\d+/);
  if (!match) return 0;

  return Number(match[0]);
}

function normalizeWarmupEntry(warmup) {
  if (!warmup || typeof warmup !== "object") {
    return null;
  }

  const normalized = {
    name: toSafeString(warmup.name),
    duration: toSafeString(warmup.duration),
    description: toSafeString(warmup.description),
    coaching_points: toSafeString(warmup.coaching_points),
    variation: toSafeString(warmup.variation),
    image_name: toSafeString(warmup.image_name),
    image_preview_url: toSafeString(warmup.image_preview_url)
  };

  const hasContent =
      normalized.name ||
      normalized.duration ||
      normalized.description ||
      normalized.coaching_points ||
      normalized.variation ||
      normalized.image_name ||
      normalized.image_preview_url;

  return hasContent ? normalized : null;
}

function normalizeExerciseEntry(exercise) {
  const normalized = {
    name: toSafeString(exercise?.name),
    duration: toSafeString(exercise?.duration),
    description: toSafeString(exercise?.description),
    coaching_points: toSafeString(exercise?.coaching_points),
    variation: toSafeString(exercise?.variation),
    material: toSafeString(exercise?.material),
    sketch_file_name: toSafeString(exercise?.sketch_file_name),
    sketch_preview_url: toSafeString(exercise?.sketch_preview_url)
  };

  const hasContent =
      normalized.name ||
      normalized.duration ||
      normalized.description ||
      normalized.coaching_points ||
      normalized.variation ||
      normalized.material ||
      normalized.sketch_file_name ||
      normalized.sketch_preview_url;

  return hasContent ? normalized : null;
}

function calculateDurationFromExerciseEntries(exercises, warmup) {
  const exerciseMinutes = exercises.reduce((sum, exercise) => {
    return sum + parseDurationToNumber(exercise.duration);
  }, 0);

  const warmupMinutes = warmup ? parseDurationToNumber(warmup.duration) : 0;

  return exerciseMinutes + warmupMinutes;
}

function getTrainingExerciseIds(trainingData) {
  if (Array.isArray(trainingData.exerciseIDs)) {
    return trainingData.exerciseIDs.filter(Boolean);
  }

  return [];
}

function createTrainingPayload(trainingData, preserveCreatedAt = null) {
  const title = toSafeString(trainingData.title);
  const age_group = toSafeString(trainingData.age_group);
  const required_players = Number(trainingData.required_players || 0);
  const enteredDuration = parseDurationToNumber(trainingData.duration);
  const is_template = Boolean(trainingData.is_template);
  const session_date = toSafeString(trainingData.session_date);
  const notes = toSafeString(trainingData.notes);
  const sketch_file_name = toSafeString(trainingData.sketch_file_name);
  const created_by_user_id = toSafeString(trainingData.created_by_user_id);
  const created_by_username = toSafeString(trainingData.created_by_username);

  const warmup = normalizeWarmupEntry(trainingData.warmup);
  const exercises = Array.isArray(trainingData.exercises)
      ? trainingData.exercises.map(normalizeExerciseEntry).filter(Boolean)
      : [];

  const fallbackDuration = calculateDurationFromExerciseEntries(exercises, warmup);
  const finalDuration = enteredDuration || fallbackDuration;

  return {
    title,
    age_group,
    required_players,
    duration: finalDuration,
    exerciseIDs: [],
    exercises,
    warmup,
    is_template,
    session_date,
    notes,
    description: notes,
    sketch_file_name,
    created_by_user_id,
    created_by_username,
    created_at: preserveCreatedAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

export async function fetchTrainingEntries() {
  const trainingsSnapshot = await getDocs(collection(db, "trainings"));

  return trainingsSnapshot.docs.map((trainingDoc) => {
    const data = trainingDoc.data();

    const warmup = normalizeWarmupEntry(data.warmup);
    const exercises = Array.isArray(data.exercises)
        ? data.exercises.map(normalizeExerciseEntry).filter(Boolean)
        : [];

    const storedDuration = parseDurationToNumber(data.duration);
    const calculatedDuration = calculateDurationFromExerciseEntries(exercises, warmup);

    return {
      id: trainingDoc.id,
      title: toSafeString(data.title) || "Unbenanntes Training",
      age_group: toSafeString(data.age_group) || "—",
      required_players: Number(data.required_players ?? 0),
      duration: storedDuration || calculatedDuration || 0,
      exerciseIDs: getTrainingExerciseIds(data),
      is_template: Boolean(data.is_template),
      session_date: toSafeString(data.session_date || data.created_at),
      created_at: toSafeString(data.created_at),
      updated_at: toSafeString(data.updated_at),
      description: toSafeString(data.description || data.notes),
      notes: toSafeString(data.notes),
      warmup,
      exercises,
      sketch_file_name: toSafeString(data.sketch_file_name),
      created_by_user_id: toSafeString(data.created_by_user_id),
      created_by_username: toSafeString(data.created_by_username)
    };
  });
}

export async function createTraining(reloadTrainings, trainingData = null) {
  if (trainingData && typeof trainingData === "object") {
    const payload = createTrainingPayload(trainingData);

    if (
        !payload.title ||
        !payload.age_group ||
        payload.required_players < 3 ||
        payload.required_players > 20 ||
        !payload.session_date
    ) {
      alert("Bitte Titel, Datum, Altersgruppe und eine gültige Spieleranzahl angeben.");
      return null;
    }

    try {
      const docRef = await addDoc(collection(db, "trainings"), payload);

      if (typeof reloadTrainings === "function") {
        await reloadTrainings();
      }

      return {
        id: docRef.id,
        ...payload
      };
    } catch (error) {
      console.error("Fehler beim Erstellen des Trainings:", error);
      alert("Training konnte nicht erstellt werden.");
      return null;
    }
  }

  const title = prompt("Titel des Trainings:");
  if (!title) return null;

  const age_group = prompt("Altersgruppe (z. B. U13):");
  if (!age_group) return null;

  const requiredPlayersInput = prompt("Benötigte Spieler:");
  if (!requiredPlayersInput) return null;

  const required_players = Number(requiredPlayersInput);

  if (Number.isNaN(required_players) || required_players <= 0) {
    alert("Bitte eine gültige Spieleranzahl eingeben.");
    return null;
  }

  const isTemplateAnswer = prompt("Als Mustertraining speichern? (ja/nein)");
  const is_template = toSafeString(isTemplateAnswer).toLowerCase() === "ja";

  try {
    const payload = {
      title: toSafeString(title),
      age_group: toSafeString(age_group),
      required_players,
      duration: 0,
      exerciseIDs: [],
      exercises: [],
      warmup: null,
      is_template,
      session_date: new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      notes: "",
      description: "",
      sketch_file_name: "",
      created_by_user_id: "",
      created_by_username: ""
    };

    const docRef = await addDoc(collection(db, "trainings"), payload);

    if (typeof reloadTrainings === "function") {
      await reloadTrainings();
    }

    return {
      id: docRef.id,
      ...payload
    };
  } catch (error) {
    console.error("Fehler beim Erstellen des Trainings:", error);
    alert("Training konnte nicht erstellt werden.");
    return null;
  }
}

export async function updateTraining(trainingId, reloadTrainings, trainingData = null) {
  if (!trainingId || !trainingData || typeof trainingData !== "object") {
    alert("Training konnte nicht aktualisiert werden.");
    return null;
  }

  const payload = createTrainingPayload(trainingData, trainingData.created_at || null);

  if (
      !payload.title ||
      !payload.age_group ||
      payload.required_players < 3 ||
      payload.required_players > 20 ||
      !payload.session_date
  ) {
    alert("Bitte Titel, Datum, Altersgruppe und eine gültige Spieleranzahl angeben.");
    return null;
  }

  try {
    await updateDoc(doc(db, "trainings", trainingId), payload);

    if (typeof reloadTrainings === "function") {
      await reloadTrainings();
    }

    return {
      id: trainingId,
      ...payload
    };
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Trainings:", error);
    alert("Training konnte nicht aktualisiert werden.");
    return null;
  }
}

export async function deleteTraining(trainingId, reloadTrainings) {
  if (!trainingId) {
    alert("Training konnte nicht gelöscht werden.");
    return false;
  }

  try {
    await deleteDoc(doc(db, "trainings", trainingId));

    if (typeof reloadTrainings === "function") {
      await reloadTrainings();
    }

    return true;
  } catch (error) {
    console.error("Fehler beim Löschen des Trainings:", error);
    alert("Training konnte nicht gelöscht werden.");
    return false;
  }
}