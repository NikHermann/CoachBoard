# Isolierte Firebase-Testumgebung (Phase 1)

Stand: 15. November 2026

## Zweck und Abgrenzung

Diese Umgebung prüft Authentifizierung, Passwort-Reset, Kontoklassifikation, Firestore-Regeln und die Erhaltung bestehender Dokumentbezüge ausschließlich mit künstlichen Daten. Sie verwendet das reservierte Firebase-Demo-Projekt `demo-coachboard-auth` und lokale Emulatoren. Es wurden weder produktive Firebase-Daten noch produktive Regeln, Konten oder Zugangsdaten übernommen oder verändert.

Die bestehende Anwendung und ihre Login-/Routing-Logik wurden nicht angebunden. Insbesondere blieben `Backend/main.js`, `Backend/firebase.js`, `firebase.json` und `.firebaserc` unverändert.

## Dateien und Zuständigkeiten

- `firebase.emulator.json`: getrennte Emulator-Konfiguration; lädt ausschließlich `firestore.test.rules`.
- `firestore.test.rules`: nur für die Testumgebung vorgesehener Regelentwurf. Er ist nicht veröffentlicht und ersetzt keine produktiven Regeln.
- `tests/firebase/runEmulators.cjs`: sicherer Einstiegspunkt; erzwingt die Demo-Projekt-ID und startet `emulators:exec` über die lokal installierte Firebase CLI.
- `tests/firebase/emulatorSafety.js`: prüft Projekt-ID, lokale Host-/Portwerte und blockiert im Testprozess nicht-lokale HTTP(S)-Ziele.
- `tests/firebase/testFirebase.js`: verbindet Auth und Firestore ausdrücklich mit `127.0.0.1`, leert die Emulatoren zwischen Testläufen und legt nur synthetische Fixtures an.
- `tests/firebase/fixtures/syntheticAccounts.js`: künstliche Kontotypen, Rollen und Trainings-/Übungszuordnungen. Alle E-Mail-Adressen verwenden die nicht zustellbare Domain `example.invalid`.
- `tests/firebase/auth.test.js`: Anmeldung und Ablehnung falscher Zugangsdaten.
- `tests/firebase/passwordReset.test.js`: lokaler Passwort-Reset, Einmalverwendung des Reset-Codes sowie altes/neues Passwort.
- `tests/firebase/classification.js` und `classification.test.js`: datensparsame Klassifikation historischer Kontotypen ohne Ausgabe von Passwörtern, vollständigen UIDs oder E-Mail-Adressen.
- `tests/firebase/firestoreRules.test.js`: positive und negative Zugriffsprüfungen für Profile, Rollen, Trainings und Übungen.
- `tests/firebase/dataIntegrity.test.js`: Erhaltung abweichender Dokument-IDs und bestehender Trainings-/Übungsreferenzen.
- `tests/firebase/safety.test.js`: Schutzprüfungen gegen falsche Projekt-ID, falsche Ports und externe Netzwerkziele.
- `tests/firebase/package.json`: begrenzt den ESM-Modus auf das Testverzeichnis.
- `package.json` und `package-lock.json`: Testbefehle und lokale Entwicklungsabhängigkeiten `firebase-tools` sowie `@firebase/rules-unit-testing`.

## Voraussetzungen und Installation

- Node.js 20 oder neuer (die verwendete Firebase CLI verlangt mindestens Node.js 20).
- Eine von der Firebase CLI unterstützte Java-Laufzeit für den Firestore Emulator; Java 21 oder neuer ist für künftige Emulatorversionen empfehlenswert.
- Einmalig im Repository: `npm install`.

Der Firestore Emulator wird bei der ersten Ausführung von der offiziellen Firebase CLI in deren lokalen Benutzer-Cache geladen. Dieser Download ist Infrastruktur der Entwicklungswerkzeuge und enthält keine Projekt- oder Nutzerdaten.

## Start, Stopp und Ports

Gesamten isolierten Testlauf starten:

```powershell
npm test
```

Gleichwertiger expliziter Befehl:

```powershell
npm run test:firebase:emulators
```

`emulators:exec` startet die Emulatoren, führt die Tests aus und beendet die Emulatoren danach automatisch, auch wenn Tests fehlschlagen. Während des Laufs gelten:

- Authentication Emulator: `127.0.0.1:9099`
- Firestore Emulator: `127.0.0.1:8080`
- Emulator UI: `127.0.0.1:4000`

Ein manueller Zugriff auf die UI ist bei dem kurzen automatischen Lauf normalerweise nicht nötig. Der Prozess kann bei Bedarf mit `Ctrl+C` beendet werden; die CLI fährt dabei ihre gestarteten Emulatoren herunter.

## Schutz vor produktiven Verbindungen

Die Trennung beruht auf mehreren unabhängigen Kontrollen:

1. Der Starter akzeptiert ausschließlich die exakte Projekt-ID `demo-coachboard-auth` und übergibt sie explizit mit `--project`.
2. Firebase-Demo-Projekt-IDs sind für Emulatorbetrieb reserviert. Die CLI meldet beim Start, dass Zugriffe auf nicht emulierte Dienste für dieses Projekt fehlschlagen.
3. Die Tests verlangen exakt `GCLOUD_PROJECT=demo-coachboard-auth`, den lokalen Auth-Host `127.0.0.1:9099` und den lokalen Firestore-Host `127.0.0.1:8080`; bei Abweichungen brechen sie vor dem Anlegen von Daten ab.
4. Auth wird explizit über `connectAuthEmulator` verbunden. Firestore-Regeltests erhalten Host und Port aus der Emulator-Umgebung.
5. Die Test-Webkonfiguration enthält nur künstliche Werte und keine produktiven Schlüssel oder Projektkennungen.
6. Ein Prozessschutz verwirft HTTP(S)-Anfragen an andere Ziele als Loopback-Adressen; ein eigener Test belegt dieses Verhalten.
7. `firebase.emulator.json` ist unabhängig von der vorhandenen `firebase.json`. Der Starter setzt außerdem den Update-Check der CLI außer Kraft.

Diese Schutzschichten gelten für den bereitgestellten Testbefehl. Einzelne Testmodule sollen nicht direkt gegen selbst gesetzte, abweichende Umgebungsvariablen ausgeführt werden.

## Synthetisch abgedeckte Kontotypen

- modernes Auth-Konto mit Firestore-Profil und übereinstimmender UID/Dokument-ID,
- migriertes Konto mit bewusst abweichender Firestore-Dokument-ID,
- Auth-Konto ohne Profil,
- Legacy-Profil mit altem Passwortfeld, aber ohne Auth-Konto,
- Legacy-Profil ohne Passwortfeld,
- unvollständiges Profil ohne E-Mail-Adresse,
- doppelte synthetische E-Mail-/Benutzernamen-Zuordnung,
- verwaistes Firestore-Profil,
- Trainer-/Adminrollen sowie Trainings- und Übungsreferenzen.

Passwortwerte werden ausschließlich im Testprozess zur Anmeldung verwendet. Klassifikation und Testausgabe enthalten weder Passwörter noch vollständige Identifikatoren oder personenbezogene Echtdaten.

## Durchgeführte Tests

Am 15. November 2026 wurde `npm run test:firebase:emulators` erfolgreich ausgeführt:

- 17 Tests ausgeführt, 17 bestanden, 0 fehlgeschlagen.
- Anmeldung eines synthetischen Auth-Kontos erfolgreich.
- Falsches Passwort und nicht vorhandenes Konto abgelehnt.
- Passwort-Reset im Auth Emulator erfolgreich; altes Passwort danach abgelehnt, neues akzeptiert und Reset-Code nur einmal verwendbar.
- Historische Kontotypen ohne Klartextausgabe korrekt klassifiziert.
- Regeltests für anonymen, eigenen, fremden, Trainer- und Adminzugriff bestanden.
- Dokument-ID sowie Trainings- und Übungsreferenzen nach den getesteten Auth-Vorgängen unverändert.
- Falsche Projekt-ID, falsche Ports und externes HTTP(S)-Ziel wurden vom Sicherheitsmodul abgelehnt.
- Die Firebase CLI bestätigte beim Start das Demo-Projekt und den Fail-Closed-Modus für nicht emulierte Dienste.

Zusätzlich wurden JavaScript-Syntax, Produktions-Build, Konfigurationsdateien und Git-Diff kontrolliert.

## Verbleibende Grenzen und Risiken

- `firestore.test.rules` ist ein isolierter Regelentwurf und wurde nicht mit den aktuell produktiv veröffentlichten Regeln abgeglichen. Daraus folgt keine Aussage, dass die Produktion bereits gleich geschützt ist.
- Die Tests prüfen SDK-/Regelverhalten, aber noch keinen Browser-End-to-End-Ablauf der bestehenden Benutzeroberfläche. Das war absichtlich außerhalb dieser Phase, weil der Login-Code unverändert bleiben musste.
- Die Emulatoren bilden Firebase sehr gut, aber nicht jede Eigenschaft produktiver Dienste, E-Mail-Zustellung oder betrieblicher Konfiguration vollständig ab.
- Die synthetischen Kontotypen bilden bekannte Fälle ab; unbekannte produktive Datenanomalien sind ohne datensparsame, rein lesende Inventur nicht ausgeschlossen.
- `npm install` meldete Sicherheitswarnungen im Abhängigkeitsbaum. Diese müssen separat bewertet und dürfen nicht durch unkontrollierte automatische Hauptversions-Upgrades behoben werden.
- Im Arbeitsbaum war `node_modules/.vite/deps/_metadata.json` bereits vor Phase 1 verändert und wurde bewusst nicht überschrieben. Drei `protobufjs`-Dateien erscheinen wegen Git-/Zeilenendestatus als verändert, sind inhaltlich jedoch identisch mit `HEAD` und besitzen keinen Git-Diff.

## Sicherung und selektive Rücknahme

Vor der Einrichtung wurde der lokale Git-Tag `backup-before-firebase-emulator-phase1-2026-11-15` auf Commit `08342cc5aa1787417e5d81abd6bd09dd8b51d100` erstellt. Der ältere Sicherungspunkt `backup-before-login-routing-fix-2026-11-15` blieb erhalten.

Zur Rücknahme ausschließlich dieser Phase, ohne andere spätere Arbeitsänderungen zu überschreiben:

1. Zuerst `git status` und `git diff` prüfen und gegebenenfalls einen neuen Sicherungspunkt des aktuellen Zustands erstellen.
2. Die neu angelegten Dateien `firebase.emulator.json`, `firestore.test.rules`, `FIREBASE_EMULATOR_DOKUMENTATION.md` und den Ordner `tests/firebase/` entfernen.
3. In `package.json` nur die drei Testskripte sowie die beiden Entwicklungsabhängigkeiten dieser Phase entfernen.
4. `package-lock.json` passend durch `npm install` aktualisieren. Bei zwischenzeitlichen fremden Abhängigkeitsänderungen nicht die gesamte Datei blind auf den Tag zurücksetzen.
5. Mit `git diff` verifizieren, dass die vorbestehende Änderung an `node_modules/.vite/deps/_metadata.json` und alle späteren unabhängigen Arbeiten erhalten sind.

Wenn seit dem Sicherungspunkt garantiert keine anderen Änderungen an `package.json` oder `package-lock.json` vorgenommen wurden, können ausschließlich diese beiden Dateien alternativ aus dem Sicherungstag wiederhergestellt werden. Ein Reset des gesamten Arbeitsbaums ist dafür weder nötig noch empfohlen. Der Firebase-Emulator-Cache außerhalb des Repositorys enthält nur heruntergeladene Werkzeugartefakte und muss für eine Code-Rücknahme nicht gelöscht werden.

Es erfolgten kein Commit, kein Push, kein Deployment, keine Regelveröffentlichung und keine produktive Firebase-Schreiboperation.
