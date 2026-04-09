This is the Backend directory for all backend stuff 

Wie man das Backend im Terminal startet:
1. Terminal öffnen
2. In den Projektordner wechseln:
3. Dev-Server starten: npm run dev
4. Dann im Browser öffnen: http://localhost:5173

Falls npm run dev nicht geht:
1. npm install dann: npm run dev
2. prüfen, ob in package.json bei scripts folgendes steht: "dev": "vite"



das machen die aktuellen Files:

index.html → Grundgerüst der Seite
main.js → verbindet UI mit den Services
firebase.js → initialisiert Firebase
authService.js → Login, Logout, Passwort, Verifikation
usersService.js → Benutzerprofile laden und erstellen
trainingsService.js → Trainings und deren Exercises verwalten
exercisesService.js → Exercises und deren Bilder verwalten
imageUtils.js → Bilder prüfen, umwandeln, komprimieren
ui.js → wiederverwendbare UI-Bausteine