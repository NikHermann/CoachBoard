# Firebase-Auth-Integration – Phase 4

Stand: 16. November 2026
Status: **Ausschließlich lokal implementiert. Keine produktive Aktivierung, Datenänderung, Migration, Regelveröffentlichung, kein Commit, Push oder Deployment.**

## 1. Sicherheitsgrenze und Ausgangszustand

Ausgangspunkt war Branch `fix/login-routing-2026-11-15`, Commit `bb8c7efc9debcffddcd10373fe3897050fa69ab8`. Vor Phase 4 waren ausschließlich vier bestehende Änderungen unter `node_modules` vorhanden. Diese Dateien wurden nicht bearbeitet oder zurückgesetzt. Bestehende Sicherungstags:

- `backup-before-firebase-emulator-phase1-2026-11-15`
- `backup-before-login-routing-fix-2026-11-15`

Ein neuer Commit, Stash oder Tag wurde nicht erstellt, weil ein Sicherungspunkt bei verändertem Arbeitsbaum fremde Änderungen einbeziehen könnte. Die Phase-4-Dateien sind einzeln rückgängig machbar.

Der neue Ablauf wird nur aktiviert, wenn die URL ausdrücklich `?authMode=emulator` enthält. Zusätzlich müssen Protokoll und Host `http://localhost`, `http://127.0.0.1` oder IPv6-Loopback sein. Andernfalls bricht die Aktivierung vor der Firebase-Initialisierung ab.

Im Testmodus gelten fest:

- Projekt: `demo-coachboard-auth`
- Auth Emulator: `127.0.0.1:9099`
- Firestore Emulator: `127.0.0.1:8080`
- synthetische Firebase-Konfiguration ohne produktive Projektkennung

Ohne URL-Parameter bleibt der bisherige Anwendungseinstieg aktiv. Der neue Modus besitzt keinen Firestore-Passwort-Fallback.

## 2. Aktivierung des lokalen Testmodus

1. Emulatoren ausschließlich mit `firebase.auth-integration.emulator.json` und Projekt `demo-coachboard-auth` starten.
2. Vite lokal starten.
3. Anwendung ausschließlich über `http://localhost:<vite-port>/?authMode=emulator` öffnen.

Die gesonderte Emulator-Konfiguration lädt `firestore.target.rules`. Ein Start ohne Emulatoren führt zu Verbindungsfehlern, nicht zu einem Fallback auf produktive Dienste.

Der Modus darf nicht veröffentlicht oder als produktionsreif betrachtet werden.

## 3. Alter und neuer Anmeldeablauf

| Bereich | Bisheriger Normalmodus | Lokaler sicherer Modus |
|---|---|---|
| Kennung | Benutzername | E-Mail-Adresse |
| Passwortprüfung | Firestore-Profil | Firebase Authentication |
| Daten vor Login | vollständige Benutzer- und Trainingsliste | keine Firestore-Liste |
| Sitzung | `sessionStorage` mit Profil-ID | `onAuthStateChanged` |
| Profil | aus kompletter Benutzerliste | einzelnes Dokument nach Auth |
| Rolle | Firestore-Profilfeld | Custom Claim, ungültig/fehlend wird `spieler` |
| Logout | lokaler Zustand | Firebase `signOut()` und Speicherbereinigung |
| Passwort vergessen | nicht angebunden | Firebase `sendPasswordResetEmail()` |

Der normale Modus wurde nicht automatisch umgeschaltet. Die bestehende Login-/Routing-Korrektur bleibt erhalten.

## 4. Geänderte und neue Dateien

### Anwendung

- `Backend/localAuthTestMode.js` – fail-closed Erkennung des expliziten localhost-Testmodus.
- `Backend/firebase.js` – wählt nur im Testmodus Demo-Konfiguration und verbindet Auth/Firestore mit localhost.
- `Backend/secureAuthAdapter.js` – aktivierbarer Adapter; alter Exportname bleibt kompatibel.
- `Backend/main.js` – lokaler Auth-Lifecycle, E-Mail-Login, Reset, sicherer Logout, Datenbereinigung und authentifiziertes Laden.
- `Backend/index.html` – IDs und standardmäßig verborgene Reset-Schaltfläche; bestehendes Layout bleibt erhalten.
- `Backend/trainingsService.js` – liest `created_by_auth_uid`; schreibt das Feld nur, wenn eine sichere Auth-UID vorhanden ist.

### Regeln und Emulator

- `firestore.target.rules` – vorhandene Trainings können über den serverseitigen `profile_id`-Claim autorisiert werden; neue Trainings benötigen passende Auth-UID und Profil-ID.
- `firebase.auth-integration.emulator.json` – isolierte lokale Emulator-Konfiguration mit Zielregeln.

### Tests

- `tests/firebase/localAuthTestMode.test.js` – Aktivierung, Demo-Projekt und Ablehnung externer Hosts/HTTPS.
- `tests/firebase/firestoreTargetRules.test.js` – moderne Eigentümerschaft, Profilkonflikt und unveränderte Legacy-Trainingsreferenz.

## 5. Sicherheitsmaßnahmen

- Keine vollständige Benutzerliste vor oder nach normaler Anmeldung im sicheren Modus.
- Profilzugriff erst nach erfolgreicher Firebase-Authentifizierung.
- Profil-ID ausschließlich aus Auth-UID oder serverseitigem `profile_id`-Claim.
- Profile mit Firestore-Passwortfeld oder falscher UID führen zum Logout.
- Rolle ausschließlich aus Custom Claims; Profilrollen werden nicht zur Autorisierung verwendet.
- Registrierung, clientseitige Benutzerverwaltung und Rollenänderung sind im sicheren Modus ausgeblendet bzw. nicht erreichbar.
- Direkte Route `/benutzer` wird im sicheren Modus abgewiesen.
- Logout entfernt Benutzer, Trainings, Übungen, Filterergebnisse, Auswahl- und Bearbeitungszustand aus dem Arbeitsspeicher.
- Reset lädt keine Firestore-Benutzerliste, blockiert Mehrfachklicks und zeigt unabhängig vom Ergebnis dieselbe Rückmeldung.
- Neue Trainings enthalten `created_by_user_id` und `created_by_auth_uid`.
- Historische Trainings ohne Auth-UID werden weder automatisch ergänzt noch migriert.
- Legacy-Eigentümerschaft wird nur akzeptiert, wenn `created_by_user_id` dem verifizierten `profile_id`-Claim beziehungsweise der Auth-UID entspricht.
- Eigentümerfelder dürfen bei Updates nicht übertragen werden.

## 6. Trainings- und Übungskompatibilität

Historische `created_by_user_id`-Werte bleiben unverändert. Ein vorhandenes Training ohne `created_by_auth_uid` kann durch den sicher zugeordneten Eigentümer aktualisiert oder gelöscht werden, ohne dass dabei eine Auth-UID nachgetragen wird. Administratoren benötigen weiterhin den serverseitigen Admin-Claim.

Neue Trainings im sicheren Modus erhalten zusätzlich `created_by_auth_uid`. Die Regeln verlangen gleichzeitig:

- `created_by_auth_uid == request.auth.uid`
- `created_by_user_id == profile_id` beziehungsweise Auth-UID

Übungen bleiben für authentifizierte Benutzer lesbar. Schreibrechte stammen ausschließlich aus `trainer`- oder `admin`-Claims. Die bestehende Oberfläche bezieht Übungseinträge überwiegend aus den eingebetteten Trainingsdaten; eine eigenständige vollständige UI-Integration der Collection `exercises` wurde nicht neu entwickelt.

## 7. Testfälle und Ergebnisse

Automatisiert geprüft werden:

- Firebase-E-Mail-/Passwortlogin und falsches Passwort
- Wiederherstellung über Auth Observer
- Firebase-Logout
- moderne und abweichende Legacy-Profil-IDs
- fehlende/falsche Claims und manipulierte Profilrolle
- UID-Konflikte und Passwortprofile
- gesperrte/entzogene Sitzungen
- Passwort-Reset im Auth Emulator
- anonyme und rollenbasierte Regelzugriffe
- eigene, fremde, neue und historische Trainings
- unveränderbare Eigentümerreferenzen
- Übungen für Spieler, Trainer und Administratoren
- unbekannte Collections
- lokaler Modusschalter und externe Hosts

Erster vollständiger Lauf: **75/76 bestanden**. Ursache war ein Rules-Auswertungsfehler beim direkten Zugriff auf einen fehlenden `profile_id`-Claim. Der Zugriff verwendet nun `Map.get()` mit Auth-UID als sicherem Standardwert; keine Berechtigung wurde gelockert.

Regelvarianten nach Korrektur: **27/27 bestanden** (`8/8` Mitigation, `19/19` Target).

Abschließende vollständige Regression: **76/76 bestanden**, 0 fehlgeschlagen, 0 übersprungen. Die in den Emulatorprotokollen sichtbaren `PERMISSION_DENIED`-Antworten sind erwartete Ergebnisse der Negativtests.

## 8. Auswirkungen und offene Voraussetzungen

Lokal funktionsfähig vorbereitet:

- E-Mail-/Passwortlogin
- Auth-State-Wiederherstellung bei Neuladen
- gezieltes eigenes Profil
- Rollen aus Claims
- sicherer Logout und lokale Datenbereinigung
- Passwortänderung mit Re-Authentifizierung
- neutraler Passwort-Reset
- neue und historische Trainingsreferenzen unter Zielregeln

Vor produktiver Umstellung fehlen zwingend:

1. Freigegebene Read-only-Inventur aller aktiven Auth-UIDs, Profile, `profile_id`-Claims, Rollen-Claims und `disabled`-Zustände.
2. Manuelle Klärung jeder uneindeutigen Zuordnung; keine automatische Migration.
3. Serverseitige Benutzerverwaltung aus Phase 3 als geprüfter, auditierter Endpunkt. Die Benutzerverwaltung bleibt im sicheren Clientmodus deaktiviert.
4. Entscheidung und Freigabe für produktive Regeln; diese Datei wurde nicht veröffentlicht.
5. Browser-End-to-End-Test des vollständigen UI-Ablaufs in einer isolierten Staging-/Emulatorumgebung.
6. Überwachung von Auth-, Profil- und Regelablehnungen ohne sensible Daten.
7. Geprüfte Rollout- und Rückfallreihenfolge. Ein Rollback auf öffentliche Regeln ist ausgeschlossen.

Benutzer ohne korrekten Claim werden als Spieler behandelt. Benutzer ohne eindeutiges, passwortfreies Profil werden fail-closed abgemeldet. Das kann Verfügbarkeit betreffen und muss vor einem produktiven Wechsel inventarisiert werden.

## 9. Rückgängig-Anleitung

Es wurden keine Daten migriert; daher ist kein Datenrollback erforderlich.

1. Lokalen Testmodus nicht mit `?authMode=emulator` aufrufen.
2. Phase-4-Änderungen ausschließlich in den in Abschnitt 4 genannten Dateien rückgängig machen.
3. Neue Dateien `Backend/localAuthTestMode.js`, `firebase.auth-integration.emulator.json`, `tests/firebase/localAuthTestMode.test.js` und diese Dokumentation entfernen.
4. Bestehende fremde Änderungen unter `node_modules` nicht anfassen.
5. Danach Syntax-, Build- und vollständige Emulatortests erneut ausführen.

Der normale Modus bleibt bis zu einer gesonderten Freigabe der bestehende Einstieg. Es erfolgte keine produktive Regeländerung, keine Konten- oder Trainingsänderung und keine Legacy-Bereinigung.
