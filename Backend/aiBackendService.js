let inspectFunction;

async function getLocalFunctionsApi() {
    if (!import.meta.env.DEV) {
        throw new Error("Die KI ist derzeit nur lokal verfügbar.");
    }

    const [{ getApp }, functionsApi] = await Promise.all([
        import("firebase/app"),
        import("firebase/functions")
    ]);
    const functions = functionsApi.getFunctions(getApp(), "us-central1");
    functionsApi.connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    return { functions, httpsCallable: functionsApi.httpsCallable };
}

export async function sendExercisesToBackend(exercises) {
    if (!inspectFunction) {
        const { functions, httpsCallable } = await getLocalFunctionsApi();
        inspectFunction = httpsCallable(functions, "inspectExercises");
    }

    const response = await inspectFunction({
        exercises: exercises.map((exercise) => ({
            id: String(exercise.id),
            name: String(exercise.name),
            duration: exercise.duration,
            description: exercise.description,
            material: exercise.material
        }))
    });

    return response.data;
}

export async function generateTrainingPlanWithAi(message, exercises) {
    const { functions, httpsCallable } = await getLocalFunctionsApi();
    const generateTrainingPlan = httpsCallable(functions, "generateTrainingPlan");
    const response = await generateTrainingPlan({ message, exercises });
    return response.data;
}
