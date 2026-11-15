
import { getApp } from "firebase/app";
import {
    getFunctions,
    connectFunctionsEmulator,
    httpsCallable
} from "firebase/functions";

let inspectFunction;

export async function sendExercisesToBackend(exercises) {
    if (!inspectFunction) {
        const functions = getFunctions(getApp(), "us-central1");

        if (import.meta.env.DEV) {
            connectFunctionsEmulator(functions, "127.0.0.1", 5001);
        }

        inspectFunction = httpsCallable(functions, "inspectExercises");
    }

    const response = await inspectFunction({
        exercises: exercises.map(e => ({
            id: String(e.id),
            name: String(e.name),
            duration: e.duration,
            description: e.description,
            material: e.material
        }))
    });

    return response.data;
}



export async function generateTrainingPlanWithAi(message, exercises) {
    // Vorerst ausschließlich lokal testen
    if (!import.meta.env.DEV) {
        throw new Error("Die KI ist derzeit nur lokal verfügbar.");
    }

    const functions = getFunctions(getApp(), "us-central1");

    const generateTrainingPlan = httpsCallable(
        functions,
        "generateTrainingPlan"
    );

    const response = await generateTrainingPlan({
        message: message,
        exercises: exercises
    });

    return response.data;
}
