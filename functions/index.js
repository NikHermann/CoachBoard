
const { onRequest } = require("firebase-functions/v2/https");
const { GoogleGenAI } = require("@google/genai");
const { defineSecret } = require("firebase-functions/params");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// Erste Testfunktion für CoachBoard
exports.healthCheck = onRequest((req, res) => {
    res.status(200).json({
        success: true,
        message: "CoachBoard KI-Backend funktioniert!"
    });
});


const { onCall, HttpsError } =
    require("firebase-functions/v2/https");

exports.inspectExercises = onCall((request) => {
    // Diese Funktion darf nur lokal laufen.
    if (process.env.FUNCTIONS_EMULATOR !== "true") {
        throw new HttpsError(
            "permission-denied",
            "Nur für lokale Entwicklung."
        );
    }

    const exercises = request.data?.exercises;

    if (!Array.isArray(exercises) || exercises.length > 150) {
        throw new HttpsError(
            "invalid-argument",
            "Ungültige Übungsdaten."
        );
    }

    const validExercises = exercises.filter(
        (exercise) =>
            typeof exercise.id === "string" &&
            typeof exercise.name === "string"
    );

    console.log("Übungen empfangen:", validExercises.length);

    return {
        success: true,
        count: validExercises.length,
        names: validExercises.slice(0, 5).map(e => e.name)
    };
});

exports.generateTrainingPlan = onCall(
    {
        secrets: [GEMINI_API_KEY],
        timeoutSeconds: 120
    },
    async (request) => {

        // Sicherheit: Nur lokal testen, nicht öffentlich bereitstellen
        if (process.env.FUNCTIONS_EMULATOR !== "true") {
            throw new HttpsError(
                "permission-denied",
                "Diese Testfunktion ist nur lokal verfügbar."
            );
        }

        const message = String(request.data?.message || "").trim();
        const exercises = request.data?.exercises;

        if (!message || message.length > 1000) {
            throw new HttpsError(
                "invalid-argument",
                "Bitte eine gültige Trainingsanfrage angeben."
            );
        }

        if (!Array.isArray(exercises) || exercises.length > 20) {
            throw new HttpsError(
                "invalid-argument",
                "Ungültige Übungsliste."
            );
        }

        const apiKey = GEMINI_API_KEY.value();

        if (!apiKey) {
            throw new HttpsError(
                "failed-precondition",
                "Gemini-API-Schlüssel fehlt."
            );
        }

        const ai = new GoogleGenAI({ apiKey });

        const availableExercises = exercises.map((exercise) => ({
            id: String(exercise.id || "").slice(0, 120),
            name: String(exercise.name || "").slice(0, 150),
            type: String(exercise.type || "").slice(0, 40),
            duration: String(exercise.duration || "").slice(0, 40),
            description: String(exercise.description || "").slice(0, 800),
            material: String(exercise.material || "").slice(0, 200)
        }));

        const prompt = `
Du bist ein Trainingsplanungsassistent für Amateurfußballtrainer.

Wunsch des Trainers:
${message}

Verfügbare Übungen aus CoachBoard:
${JSON.stringify(availableExercises, null, 2)}

Erstelle einen verständlichen Fußballtrainingsplan.

Regeln:
- Verwende ausschließlich Übungen aus der bereitgestellten Liste.
- Nenne die Übungsnamen exakt wie in der Datenbank.
- Berücksichtige Trainingsziel, Altersgruppe, Spieleranzahl und Dauer.
- Gliedere den Plan sinnvoll in Aufwärmen, Hauptteil und Abschluss.
- Gib zu jeder Übung die Dauer und eine kurze Begründung an.
- Wenn nicht genügend passende Übungen vorhanden sind,
  erkläre offen, welche Anforderungen nicht erfüllt werden können.
- Erfinde keine zusätzlichen Datenbankübungen.
- Antworte auf Deutsch.
`;

        try {
            const response = await ai.models.generateContent({
                model: "gemini-3.5-flash-lite",
                contents: prompt
            });

            return {
                success: true,
                trainingPlan: response.text || "Keine Antwort erhalten."
            };

        } catch (error) {
            console.error(
                "Gemini-Anfrage fehlgeschlagen:",
                error?.status || error?.code || "Unbekannter Fehler"
            );

            throw new HttpsError(
                "internal",
                "Gemini konnte die Anfrage nicht verarbeiten."
            );
        }
    }
);
