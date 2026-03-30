import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
  arrayRemove,
  addDoc,
  deleteField
} from "firebase/firestore";

const usersList = document.getElementById("users-list");
const trainingsList = document.getElementById("trainings-list");
const exercisesList = document.getElementById("exercises-list");
const reloadBtn = document.getElementById("reload-btn");
const createUserBtn = document.getElementById("create-user-btn");
const createTrainingBtn = document.getElementById("create-training-btn");
const createExerciseBtn = document.getElementById("create-exercise-btn");

reloadBtn.addEventListener("click", loadAll);
createUserBtn.addEventListener("click", createUser);
createTrainingBtn.addEventListener("click", createTraining);
createExerciseBtn.addEventListener("click", createExercise);

function createDeleteButton(label, onClick) {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.style.marginRight = "8px";
  btn.addEventListener("click", onClick);
  return btn;
}

function createActionButton(label, onClick) {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.style.marginRight = "8px";
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

async function createExercise() {
  const name = prompt("Name der Exercise:");
  if (!name) return;

  const type = prompt("Typ der Exercise:");
  if (!type) return;

  const description = prompt("Beschreibung:");
  if (!description) return;

  const coachingPointsInput = prompt("Coaching Points (mit Komma getrennt):");
  const durationInput = prompt("Dauer in Minuten:");

  if (!durationInput) return;

  const duration = Number(durationInput);

  if (Number.isNaN(duration)) {
    alert("Dauer muss eine Zahl sein.");
    return;
  }

  const coaching_points = coachingPointsInput
    ? coachingPointsInput.split(",").map((point) => point.trim()).filter(Boolean)
    : [];

  try {
    await addDoc(collection(db, "exercises"), {
      name,
      type,
      description,
      coaching_points,
      duration,
      img: ""
    });

    await loadExercises();
    await loadTrainings();
  } catch (error) {
    console.error("Fehler beim Erstellen der Exercise:", error);
    alert("Exercise konnte nicht erstellt werden.");
  }
}

// -------- BILD-HILFSFUNKTIONEN (BASE64 IN FIRESTORE) --------
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);

    reader.readAsDataURL(file);
  });
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function estimateDataUrlSize(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}

function renderImageToDataUrl(img, width, height, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", quality);
}

async function compressImageToDataUrl(file, options = {}) {
  const {
    maxWidth = 1200,
    maxHeight = 1200,
    maxBytes = 70 * 1024,
    startQuality = 0.82,
    minQuality = 0.45
  } = options;

  const img = await loadImageFromFile(file);

  let width = img.width;
  let height = img.height;

  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  let quality = startQuality;
  let dataUrl = renderImageToDataUrl(img, width, height, quality);

  while (estimateDataUrlSize(dataUrl) > maxBytes && quality > minQuality) {
    quality = Math.max(minQuality, quality - 0.08);
    dataUrl = renderImageToDataUrl(img, width, height, quality);
  }

  while (estimateDataUrlSize(dataUrl) > maxBytes && width > 300 && height > 300) {
    width = Math.round(width * 0.9);
    height = Math.round(height * 0.9);

    quality = startQuality;
    dataUrl = renderImageToDataUrl(img, width, height, quality);

    while (estimateDataUrlSize(dataUrl) > maxBytes && quality > minQuality) {
      quality = Math.max(minQuality, quality - 0.08);
      dataUrl = renderImageToDataUrl(img, width, height, quality);
    }
  }

  return dataUrl;
}

async function uploadExerciseImage(exerciseId, file) {
  const dataUrl = await prepareExerciseImageDataUrl(file);

  await updateDoc(doc(db, "exercises", exerciseId), {
    img: dataUrl
  });

  return dataUrl;
}

async function deleteExerciseImage(exerciseId) {
  await updateDoc(doc(db, "exercises", exerciseId), {
    img: deleteField()
  });
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
            await loadTrainings();
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
            await loadTrainings();
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
      await loadTrainings();
    });

    card.appendChild(document.createElement("br"));
    card.appendChild(document.createElement("br"));
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
      `Bild: ${data.img ? "vorhanden" : "-"}`
    ]);

    const previewImage = document.createElement("img");
    previewImage.alt = data.name || "Exercise Bild";
    previewImage.style.maxWidth = "220px";
    previewImage.style.maxHeight = "160px";
    previewImage.style.display = "none";
    previewImage.style.marginBottom = "10px";
    previewImage.style.borderRadius = "6px";
    previewImage.style.objectFit = "cover";
    previewImage.style.border = "1px solid #ccc";

    const imageSizeText = document.createElement("p");
    imageSizeText.style.fontSize = "13px";
    imageSizeText.style.margin = "4px 0 10px 0";
    imageSizeText.style.color = "#555";
    imageSizeText.style.display = "none";

    if (data.img && typeof data.img === "string" && data.img !== "wird_noch_befüllt") {
      previewImage.src = data.img;
      previewImage.style.display = "block";

      const storedBytes = estimateDataUrlSize(data.img);
      imageSizeText.textContent = `Gespeicherte Bildgröße: ${formatBytes(storedBytes)}`;
      imageSizeText.style.display = "block";
    }

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "block";
    fileInput.style.marginBottom = "10px";

    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (!file) return;

      const localUrl = URL.createObjectURL(file);
      previewImage.src = localUrl;
      previewImage.style.display = "block";

      imageSizeText.textContent = "";
      imageSizeText.style.display = "none";
    });

    const statusText = document.createElement("p");
    statusText.style.fontSize = "14px";
    statusText.style.margin = "6px 0";

    const uploadBtn = createActionButton("Bild hochladen", async () => {
      const file = fileInput.files[0];

      if (!file) {
        alert("Bitte zuerst ein Bild auswählen.");
        return;
      }

      uploadBtn.disabled = true;

      try {
        if (file.size <= DIRECT_UPLOAD_LIMIT) {
          statusText.textContent = "Bild wird gespeichert...";
        } else {
          statusText.textContent = "Bild wird geprüft...";
        }

        const dataUrl = await uploadExerciseImage(exerciseDoc.id, file);

        previewImage.src = dataUrl;
        previewImage.style.display = "block";

        const finalBytes = estimateDataUrlSize(dataUrl);
        imageSizeText.textContent = `Gespeicherte Bildgröße: ${formatBytes(finalBytes)}`;
        imageSizeText.style.display = "block";

        statusText.textContent = "Bild erfolgreich gespeichert.";

        await loadExercises();
      } catch (error) {
        console.error("Fehler beim Speichern des Bildes:", error);
        statusText.textContent = error.message || "Fehler beim Speichern.";
        alert(error.message || "Bild konnte nicht gespeichert werden.");
      } finally {
        uploadBtn.disabled = false;
      }
    });

    const deleteImageBtn = createActionButton("Bild löschen", async () => {
      const hasImage = data.img && typeof data.img === "string" && data.img !== "wird_noch_befüllt";

      if (!hasImage) {
        alert("Für diese Übung ist kein Bild gespeichert.");
        return;
      }

      const confirmed = confirm(`Bild von "${data.name || exerciseDoc.id}" wirklich löschen?`);
      if (!confirmed) return;

      try {
        await deleteExerciseImage(exerciseDoc.id);
        await loadExercises();
      } catch (error) {
        console.error("Fehler beim Löschen des Bildes:", error);
        alert(`Bild konnte nicht gelöscht werden: ${error.code || error.message}`);
      }
    });

    const deleteBtn = createDeleteButton("Exercise löschen", async () => {
      const confirmed = confirm(`Exercise ${exerciseDoc.id} wirklich löschen?`);
      if (!confirmed) return;

      await removeExerciseFromAllTrainings(exerciseDoc.id);
      await deleteDoc(doc(db, "exercises", exerciseDoc.id));

      await loadTrainings();
      await loadExercises();
    });

    card.appendChild(previewImage);
    card.appendChild(imageSizeText);
    card.appendChild(fileInput);
    card.appendChild(statusText);
    card.appendChild(uploadBtn);
    card.appendChild(deleteImageBtn);
    card.appendChild(deleteBtn);

    exercisesList.appendChild(card);
  });
}

const DIRECT_UPLOAD_LIMIT = 80 * 1024;       // bis 80 KB direkt hochladen
const TARGET_COMPRESSED_BYTES = 70 * 1024;   // Zielgröße nach Komprimierung
const MAX_FINAL_BYTES = 120 * 1024;          // harte Obergrenze für gespeichertes Bild
const ABSOLUTE_FILE_LIMIT = 15 * 1024 * 1024; // alles darüber gar nicht erst versuchen

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function prepareExerciseImageDataUrl(file) {
  if (file.size > ABSOLUTE_FILE_LIMIT) {
    throw new Error(
      `Bild ist zu groß (${formatBytes(file.size)}). Bitte ein Bild unter ${formatBytes(ABSOLUTE_FILE_LIMIT)} wählen.`
    );
  }

  // Kleine Bilder direkt übernehmen
  if (file.size <= DIRECT_UPLOAD_LIMIT) {
    const directDataUrl = await fileToDataUrl(file);

    if (estimateDataUrlSize(directDataUrl) > MAX_FINAL_BYTES) {
      throw new Error("Das Bild ist nach dem Einlesen noch zu groß. Bitte ein kleineres Bild wählen.");
    }

    return directDataUrl;
  }

  // Größere Bilder nur nach Bestätigung komprimieren
  const shouldCompress = confirm(
    `Das Bild ist ${formatBytes(file.size)} groß.\n\nSoll es automatisch herunterkomprimiert werden?`
  );

  if (!shouldCompress) {
    throw new Error("Upload abgebrochen. Bild wurde nicht komprimiert.");
  }

  const compressedDataUrl = await compressImageToDataUrl(file, {
    maxWidth: 1200,
    maxHeight: 1200,
    maxBytes: TARGET_COMPRESSED_BYTES
  });

  const finalSize = estimateDataUrlSize(compressedDataUrl);

  if (finalSize > MAX_FINAL_BYTES) {
    throw new Error(
      `Das Bild ist selbst nach der Komprimierung noch zu groß (${formatBytes(finalSize)}). Bitte ein kleineres Bild wählen.`
    );
  }

  return compressedDataUrl;
}

async function removeExerciseFromAllTrainings(exerciseId) {
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

function getTrainingExerciseIds(trainingData) {
  if (Array.isArray(trainingData.exerciseIDs)) {
    return trainingData.exerciseIDs;
  }

  if (Array.isArray(trainingData.exercises)) {
    return trainingData.exercises;
  }

  return [];
}

function calculateTrainingDuration(exerciseIds, exerciseMap) {
  return exerciseIds.reduce((sum, exerciseId) => {
    const exercise = exerciseMap.get(exerciseId);
    return sum + Number(exercise?.duration || 0);
  }, 0);
}

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

async function addExerciseToTraining(trainingId, currentExerciseIds, exerciseId) {
  if (!exerciseId) return;
  if (currentExerciseIds.includes(exerciseId)) return;

  const nextExerciseIds = [...currentExerciseIds, exerciseId];
  await saveTrainingExercises(trainingId, nextExerciseIds);
}

async function removeExerciseFromTraining(trainingId, currentExerciseIds, exerciseId) {
  const nextExerciseIds = currentExerciseIds.filter((id) => id !== exerciseId);
  await saveTrainingExercises(trainingId, nextExerciseIds);
}

// -------- USER ERSTELLEN --------
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

// -------- TRAINING ERSTELLEN --------
async function createTraining() {
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