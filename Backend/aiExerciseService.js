
export function searchExercisesForAi(exercises, searchTerm) {
    const term = String(searchTerm || "")
        .trim()
        .toLowerCase();

    if (!term) return [];

    return exercises
        .filter((exercise) => {
            const searchText = [
                exercise.title,
                exercise.description,
                exercise.coaching_points,
                exercise.variation,
                exercise.material,
                exercise.trainingTitle
            ]
                .join(" ")
                .toLowerCase();

            return searchText.includes(term);
        })
        .slice(0, 10)
        .map((exercise) => ({
            id: exercise.id,
            name: exercise.title,
            type: exercise.type,
            duration: exercise.duration,
            description: exercise.description,
            coachingPoints: exercise.coaching_points,
            material: exercise.material,
            ageGroup: exercise.age_group,
            players: exercise.required_players
        }));
}
