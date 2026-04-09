console.log("exercisesService.js neu geladen");

import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
  addDoc,
  deleteField
} from "firebase/firestore";
import { createActionButton, createCard, createDeleteButton } from "./ui.js";
import {
  prepareExerciseImageDataUrl,
  estimateDataUrlSize,
  formatBytes,
  DIRECT_UPLOAD_LIMIT
} from "./imageUtils.js";
import { removeExerciseFromAllTrainings } from "./trainingsService.js";

// Lädt ein Bild, komprimiert es bei Bedarf und speichert es in Firestore
async function uploadExerciseImage(exerciseId, file) {
  const dataUrl = await prepareExerciseImageDataUrl(file);

  await updateDoc(doc(db, "exercises", exerciseId), {
    img: dataUrl
  });

  return dataUrl;
}

// Löscht nur das Bildfeld der Exercise
async function deleteExerciseImage(exerciseId) {
  await updateDoc(doc(db, "exercises", exerciseId), {
    img: deleteField()
  });
}

// Neue Exercise anlegen
export async function createExercise(reloadExercises, reloadTrainings) {
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

    await reloadExercises();
    await reloadTrainings();
  } catch (error) {
    console.error("Fehler beim Erstellen der Exercise:", error);
    alert("Exercise konnte nicht erstellt werden.");
  }
}

// Bestehende Exercise bearbeiten
async function editExercise(exerciseId, currentData, exercisesList, reloadTrainings) {
  const name = prompt("Name der Exercise:", currentData.name || "");
  if (name === null) return;

  const type = prompt("Typ der Exercise:", currentData.type || "");
  if (type === null) return;

  const description = prompt("Beschreibung:", currentData.description || "");
  if (description === null) return;

  const coachingPointsDefault = Array.isArray(currentData.coaching_points)
    ? currentData.coaching_points.join(", ")
    : (currentData.coaching_points || "");

  const coachingPointsInput = prompt(
    "Coaching Points (mit Komma getrennt):",
    coachingPointsDefault
  );
  if (coachingPointsInput === null) return;

  const durationInput = prompt(
    "Dauer in Minuten:",
    String(currentData.duration ?? "")
  );
  if (durationInput === null) return;

  const duration = Number(durationInput);

  if (Number.isNaN(duration)) {
    alert("Dauer muss eine Zahl sein.");
    return;
  }

  const coaching_points = coachingPointsInput
    .split(",")
    .map((point) => point.trim())
    .filter(Boolean);

  try {
    await updateDoc(doc(db, "exercises", exerciseId), {
      name: name.trim(),
      type: type.trim(),
      description: description.trim(),
      coaching_points,
      duration
    });

    await reloadTrainings();
    await loadExercises(exercisesList, reloadTrainings);
  } catch (error) {
    console.error("Fehler beim Bearbeiten der Exercise:", error);
    alert("Exercise konnte nicht bearbeitet werden.");
  }
}

// Rendert alle Exercises inkl. Bild-Upload, Bearbeiten und Löschen
export async function loadExercises(exercisesList, reloadTrainings) {
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

    // Vorschau für vorhandenes oder neu ausgewähltes Bild
    const previewImage = document.createElement("img");
    previewImage.alt = data.name || "Exercise Bild";
    previewImage.style.maxWidth = "220px";
    previewImage.style.maxHeight = "160px";
    previewImage.style.display = "none";
    previewImage.style.marginBottom = "10px";
    previewImage.style.borderRadius = "6px";
    previewImage.style.objectFit = "cover";
    previewImage.style.border = "1px solid #ccc";

    // Debug-Info zur final gespeicherten Bildgröße
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

    // Dateiauswahl für Bild-Upload
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "block";
    fileInput.style.marginBottom = "10px";

    // Zeigt lokal sofort eine Vorschau, bevor gespeichert wird
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

    // Bild hochladen / komprimieren / speichern
    const uploadBtn = createActionButton("Bild hochladen", async () => {
      const file = fileInput.files[0];

      if (!file) {
        alert("Bitte zuerst ein Bild auswählen.");
        return;
      }

      uploadBtn.disabled = true;

      try {
        statusText.textContent =
          file.size <= DIRECT_UPLOAD_LIMIT
            ? "Bild wird gespeichert..."
            : "Bild wird geprüft...";

        const dataUrl = await uploadExerciseImage(exerciseDoc.id, file);

        previewImage.src = dataUrl;
        previewImage.style.display = "block";

        const finalBytes = estimateDataUrlSize(dataUrl);
        imageSizeText.textContent = `Gespeicherte Bildgröße: ${formatBytes(finalBytes)}`;
        imageSizeText.style.display = "block";

        statusText.textContent = "Bild erfolgreich gespeichert.";

        await loadExercises(exercisesList, reloadTrainings);
      } catch (error) {
        console.error("Fehler beim Speichern des Bildes:", error);
        statusText.textContent = error.message || "Fehler beim Speichern.";
        alert(error.message || "Bild konnte nicht gespeichert werden.");
      } finally {
        uploadBtn.disabled = false;
      }
    });

    const editBtn = createActionButton("Exercise bearbeiten", async () => {
      await editExercise(exerciseDoc.id, data, exercisesList, reloadTrainings);
    });

    // Löscht nur das Bild, nicht die ganze Exercise
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
        await loadExercises(exercisesList, reloadTrainings);
      } catch (error) {
        console.error("Fehler beim Löschen des Bildes:", error);
        alert(`Bild konnte nicht gelöscht werden: ${error.code || error.message}`);
      }
    });

    // Löscht die Exercise komplett und entfernt sie vorher aus allen Trainings
    const deleteBtn = createDeleteButton("Exercise löschen", async () => {
      const confirmed = confirm(`Exercise ${exerciseDoc.id} wirklich löschen?`);
      if (!confirmed) return;

      await removeExerciseFromAllTrainings(exerciseDoc.id);
      await deleteDoc(doc(db, "exercises", exerciseDoc.id));

      await reloadTrainings();
      await loadExercises(exercisesList, reloadTrainings);
    });

    card.appendChild(previewImage);
    card.appendChild(imageSizeText);
    card.appendChild(fileInput);
    card.appendChild(statusText);
    card.appendChild(uploadBtn);
    card.appendChild(editBtn);
    card.appendChild(deleteImageBtn);
    card.appendChild(deleteBtn);

    exercisesList.appendChild(card);
  });
}