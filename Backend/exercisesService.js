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
import {
    prepareExerciseImageDataUrl,
    DIRECT_UPLOAD_LIMIT,
    estimateDataUrlSize,
    formatBytes
} from "./imageUtils.js";
import { removeExerciseFromAllTrainings } from "./trainingsService.js";
import {
    createActionButton,
    createActionRow,
    createBadge,
    createCard,
    createDeleteButton,
    createElement,
    createEmptyState,
    createMetaItem,
    createTagRow,
    clearElement
} from "./ui.js";

export async function uploadExerciseImage(exerciseId, file) {
    const dataUrl = await prepareExerciseImageDataUrl(file);
    await updateDoc(doc(db, "exercises", exerciseId), { img: dataUrl });
    return dataUrl;
}

export async function deleteExerciseImage(exerciseId) {
    await updateDoc(doc(db, "exercises", exerciseId), {
        img: deleteField()
    });
}

function normalizeExercise(exerciseDoc) {
    const data = exerciseDoc.data();
    const coachingPoints = Array.isArray(data.coaching_points)
        ? data.coaching_points
        : typeof data.coaching_points === "string"
            ? data.coaching_points.split(",").map((item) => item.trim()).filter(Boolean)
            : [];

    return {
        id: exerciseDoc.id,
        name: data.name || exerciseDoc.id,
        type: data.type || "-",
        description: data.description || "Keine Beschreibung vorhanden.",
        coaching_points: coachingPoints,
        duration: Number(data.duration || 0),
        img: typeof data.img === "string" ? data.img : ""
    };
}

function filterExercises(exercises, query = "") {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return exercises;

    return exercises.filter((exercise) => {
        return [exercise.name, exercise.type, exercise.description, exercise.coaching_points.join(" ")]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery);
    });
}

export async function fetchExercises() {
    const snapshot = await getDocs(collection(db, "exercises"));
    return snapshot.docs.map((exerciseDoc) => normalizeExercise(exerciseDoc));
}

export async function createExercise(reloadExercises, reloadTrainings, exerciseData = null) {
    if (exerciseData && typeof exerciseData === "object") {
        const name = String(exerciseData.name || "").trim();
        const type = String(exerciseData.type || "").trim();
        const description = String(exerciseData.description || "").trim();
        const duration = Number(exerciseData.duration || 0);
        const coaching_points = typeof exerciseData.coaching_points === "string"
            ? exerciseData.coaching_points.split(",").map((point) => point.trim()).filter(Boolean)
            : Array.isArray(exerciseData.coaching_points)
                ? exerciseData.coaching_points
                : [];

        if (!name || !type || !description || Number.isNaN(duration) || duration <= 0) {
            alert("Bitte alle Pflichtfelder korrekt ausfüllen.");
            return;
        }

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

        return;
    }

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

async function editExercise(exerciseId, currentData, exercisesList, reloadTrainings, options = {}) {
    const name = prompt("Name der Exercise:", currentData.name || "");
    if (name === null) return;

    const type = prompt("Typ der Exercise:", currentData.type || "");
    if (type === null) return;

    const description = prompt("Beschreibung:", currentData.description || "");
    if (description === null) return;

    const coachingPointsDefault = Array.isArray(currentData.coaching_points)
        ? currentData.coaching_points.join(", ")
        : (currentData.coaching_points || "");

    const coachingPointsInput = prompt("Coaching Points (mit Komma getrennt):", coachingPointsDefault);
    if (coachingPointsInput === null) return;

    const durationInput = prompt("Dauer in Minuten:", String(currentData.duration ?? ""));
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
        await loadExercises(exercisesList, reloadTrainings, options);
    } catch (error) {
        console.error("Fehler beim Bearbeiten der Exercise:", error);
        alert("Exercise konnte nicht bearbeitet werden.");
    }
}

export async function loadExercises(exercisesList, reloadTrainings, options = {}) {
    clearElement(exercisesList);

    const exercises = filterExercises(await fetchExercises(), options.query || "");

    if (exercises.length === 0) {
        exercisesList.appendChild(createEmptyState("Noch keine Übungen vorhanden."));
        return exercises;
    }

    exercises.forEach((exercise) => {
        const coachingPointsText = exercise.coaching_points.length > 0 ? exercise.coaching_points : ["Keine Coaching Points"];

        const card = createCard(
            exercise.name,
            `${exercise.type} • ${exercise.duration} min`,
            [
                createMetaItem("ID", exercise.id),
                createMetaItem("Typ", exercise.type),
                createMetaItem("Dauer", `${exercise.duration} min`),
                createMetaItem("Bild", exercise.img ? "vorhanden" : "-"),
            ],
            exercise.description
        );

        card.appendChild(createTagRow(coachingPointsText.map((point) => createBadge(point, "muted"))));

        const preview = createElement("img", {
            className: "exercise-image",
            alt: exercise.name,
            src: exercise.img || ""
        });

        if (!exercise.img || exercise.img === "wird_noch_befüllt") {
            preview.removeAttribute("src");
        }

        card.appendChild(preview);

        const uploadStack = createElement("div", { className: "upload-stack" });
        const fileInput = createElement("input", {
            className: "field__control",
            type: "file",
            accept: "image/*"
        });

        const sizeText = createElement("p", { className: "status-copy" });
        if (exercise.img && exercise.img !== "wird_noch_befüllt") {
            sizeText.textContent = `Gespeicherte Bildgröße: ${formatBytes(estimateDataUrlSize(exercise.img))}`;
        }

        const statusText = createElement("p", { className: "status-copy" });

        uploadStack.appendChild(fileInput);
        uploadStack.appendChild(sizeText);
        uploadStack.appendChild(statusText);
        card.appendChild(uploadStack);

        const uploadButton = createActionButton("Bild hochladen", async () => {
            const file = fileInput.files?.[0];
            if (!file) {
                alert("Bitte zuerst ein Bild auswählen.");
                return;
            }

            uploadButton.disabled = true;

            try {
                statusText.textContent = file.size <= DIRECT_UPLOAD_LIMIT
                    ? "Bild wird gespeichert..."
                    : "Bild wird komprimiert und gespeichert...";

                const dataUrl = await uploadExerciseImage(exercise.id, file);
                preview.src = dataUrl;
                sizeText.textContent = `Gespeicherte Bildgröße: ${formatBytes(estimateDataUrlSize(dataUrl))}`;
                statusText.textContent = "Bild erfolgreich gespeichert.";

                await loadExercises(exercisesList, reloadTrainings, options);
                await reloadTrainings();
            } catch (error) {
                console.error("Fehler beim Speichern des Bildes:", error);
                statusText.textContent = error.message || "Fehler beim Speichern.";
                alert(error.message || "Bild konnte nicht gespeichert werden.");
            } finally {
                uploadButton.disabled = false;
            }
        }, "primary");

        const editButton = createActionButton("Exercise bearbeiten", async () => {
            await editExercise(exercise.id, exercise, exercisesList, reloadTrainings, options);
        }, "secondary");

        const deleteImageButton = createActionButton("Bild löschen", async () => {
            if (!exercise.img || exercise.img === "wird_noch_befüllt") {
                alert("Für diese Übung ist kein Bild gespeichert.");
                return;
            }

            const confirmed = confirm(`Bild von "${exercise.name}" wirklich löschen?`);
            if (!confirmed) return;

            try {
                await deleteExerciseImage(exercise.id);
                await loadExercises(exercisesList, reloadTrainings, options);
            } catch (error) {
                console.error("Fehler beim Löschen des Bildes:", error);
                alert(error.message || "Bild konnte nicht gelöscht werden.");
            }
        });

        const deleteButton = createDeleteButton("Exercise löschen", async () => {
            const confirmed = confirm(`Exercise ${exercise.name} wirklich löschen?`);
            if (!confirmed) return;

            try {
                await removeExerciseFromAllTrainings(exercise.id);
                await deleteDoc(doc(db, "exercises", exercise.id));
                await reloadTrainings();
                await loadExercises(exercisesList, reloadTrainings, options);
            } catch (error) {
                console.error("Fehler beim Löschen der Exercise:", error);
                alert("Exercise konnte nicht gelöscht werden.");
            }
        });

        card.appendChild(createActionRow([
            uploadButton,
            editButton,
            deleteImageButton,
            deleteButton
        ]));

        exercisesList.appendChild(card);
    });

    return exercises;
}