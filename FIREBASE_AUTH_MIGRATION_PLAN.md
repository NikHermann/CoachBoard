# Firebase-Auth-Migrationsplan – Phase 2

Stand: 16. November 2026
Status: **Ausschließlich lokal vorbereitet und im Demo-Emulator getestet. Nicht im Anwendungseinstieg aktiviert.**

## 1. Ziel und Sicherheitsgrenze

Phase 2 bereitet einen einheitlichen Firebase-Auth-Ablauf vor, ohne den bestehenden Login oder produktive Daten zu verändern. Der neue Ablauf ist absichtlich nicht aus `Backend/main.js` importiert. Es erfolgten keine produktiven Firebase-Verbindungen, Regelveröffentlichungen, Konto- oder Datenmigrationen, Deployments, Pushes oder Commits.

Der vorbereitete Ablauf:

1. akzeptiert E-Mail-Adresse und Passwort,
2. übergibt die Passwortprüfung ausschließlich an Firebase Authentication,
3. beobachtet die Firebase-Sitzung über `onAuthStateChanged`,
4. liest erst nach bestätigter Authentifizierung genau ein zugeordnetes Firestore-Profil,
5. liest oder vergleicht keine Firestore-Passwortfelder,
6. leitet privilegierte Rollen ausschließlich aus verifizierten Token-Claims ab,
7. erhält Legacy-Dokument-IDs über einen serverseitig gesetzten `profile_id`-Claim,
8. beendet unvollständige oder widersprüchliche Sitzungen fail-closed durch Firebase-Logout.

## 2. Ausgangszustand und Rücknahmepunkt

Vor Phase 2 wurde folgender Zustand erfasst:

- Branch: `fix/login-routing-2026-11-15`
- Commit: `b575a6577491db2ca40a1818720a6e77f6d3d42d`
- Remote-Sicherung: `origin/fix/login-routing-2026-11-15` zeigt auf denselben Commit.
- Vorhandene Tags: `backup-before-firebase-emulator-phase1-2026-11-15` und `backup-before-login-routing-fix-2026-11-15`.
- Bereits vor Phase 2 verändert: vier Dateien unter `node_modules`, `package.json`, `tests/firebase/testFirebase.js` sowie die uncommittierten Dateien aus der Firestore-Sicherheitsphase.
- Die bestehenden `node_modules`-Änderungen wurden nicht verändert oder zurückgesetzt.

Es wurde kein neuer Commit, Stash oder Tag erzeugt. Ein solcher Git-Sicherungspunkt hätte bei dem bereits veränderten Arbeitsbaum fremde Änderungen einbeziehen oder bestehende uncommittierte Sicherheitsarbeit verschieben können. Der sichere Phase-2-Rücknahmepunkt besteht deshalb aus dem unveränderten Ausgangscommit plus den ausschließlich additiven, unten einzeln aufgeführten Phase-2-Dateien.

## 3. Änderungen und Dateien

### Neu: `Backend/secureAuthFlow.js`

Reiner, injizierbarer Zustandsautomat ohne Import von `Backend/firebase.js`:

- validiert und normalisiert E-Mail-Adressen,
- ruft ausschließlich die injizierte Firebase-Auth-Anmeldung auf,
- verwaltet `idle`, `signed-out`, `loading-profile`, `authenticated` und `error`,
- lädt Claims und Profil erst nach einem Auth-Observer-Ereignis,
- verwendet standardmäßig die Auth-UID als Profildokument-ID,
- unterstützt bestehende abweichende Dokument-IDs ausschließlich über den verifizierten Claim `profile_id`,
- akzeptiert nur `spieler`, `trainer` und `admin` als Rollen-Claims,
- reduziert fehlende oder unbekannte Rollen-Claims auf die minimale Spielerrolle,
- entfernt das Firestore-Profilfeld `role` aus dem Anwendungsprofil,
- verweigert Profile mit `password`-Feld oder abweichender `uid`,
- führt bei Profilfehlern einen sicheren Firebase-Logout aus,
- verwirft verspätete asynchrone Ergebnisse nach Logout, Zustandswechsel oder `dispose()`.

### Neu: `Backend/secureAuthAdapter.js`

Noch nicht aktivierter Adapter:

- verwendet `login`, `logout` und `observeAuth` aus `Backend/authService.js`,
- liest Token-Claims über Firebase Auth,
- liest genau `users/{profileId}` über `getDoc`,
- enthält weder Benutzerlistenabfrage noch Passwortvergleich,
- wird von `Backend/main.js` nicht importiert und verändert die laufende Anwendung daher nicht.

### Neu: `tests/firebase/secureAuthFlow.test.js`

Vierzehn isolierte Tests mit synthetischen Konten. Der Test lädt `firestore.target.rules` und verwendet ausschließlich `demo-coachboard-auth` mit lokalen Auth-/Firestore-Emulatoren.

### Unverändert

- `Backend/main.js`
- `Backend/firebase.js`
- `Backend/authService.js`
- `.firebaserc`
- `firebase.json`
- `firebase.emulator.json`
- `firestore.target.rules`
- bestehende Login-/Routing-Korrekturen

## 4. Funktionsfähiger vorbereiteter Ablauf

### E-Mail-Login

`loginWithEmail(email, password)` normalisiert die E-Mail und ruft die injizierte Firebase-Funktion auf. Das Passwort wird weder gespeichert noch geloggt noch an Firestore übergeben. Auth-Fehler wie falsches Passwort oder deaktiviertes Konto werden nicht durch einen unsicheren Firestore-Fallback umgangen.

### Sitzungsverwaltung

`start()` registriert genau einen Auth-Observer. Ein bestätigter Auth-Benutzer löst Claim- und Profilprüfung aus. Ein `null`-Benutzer beendet den Anwendungszustand. Derselbe Mechanismus stellt nach Browser-Neuladen eine noch gültige Firebase-Sitzung wieder her.

### Profilauflösung

- Modernes Profil: `users/{auth.uid}`.
- Bestehende abweichende Legacy-Dokument-ID: `users/{request.auth.token.profile_id}`.
- Das geladene Dokument muss ein `uid`-Feld besitzen, das exakt der Auth-UID entspricht.
- Ein vorhandenes Passwortfeld führt unabhängig von Rolle oder Dokument-ID zum Abbruch und Logout.

Damit bleiben Firestore-Dokument-ID und Referenzen erhalten. Die Zuordnung selbst muss später serverseitig geprüft und als Claim gesetzt werden.

### Rollen

Die wirksame Rolle stammt ausschließlich aus `request.auth.token.role` bzw. dem entsprechenden ID-Token-Claim. Das Firestore-Feld `role` wird nicht in das zurückgegebene Anwendungsprofil übernommen. Fehlende oder unbekannte Claims werden auf `spieler` reduziert und erhalten unter `firestore.target.rules` keine Trainer-/Admin-Schreibrechte.

### Logout

`logout()` ruft Firebase `signOut` auf. Der Observer setzt den Zustand anschließend auf `signed-out`. Laufende Profilauflösungen werden durch eine Generationsnummer ungültig und können keine alte Sitzung wiederherstellen.

## 5. Benutzername als optionaler Login

Der Client implementiert bewusst keine Firestore-Suche nach Benutzernamen und keine öffentliche Zuordnungscollection. `loginWithIdentifier()` akzeptiert derzeit nur eine E-Mail-Adresse. Ein Benutzername wird mit `username-login-requires-backend` fail-closed abgewiesen.

Ein späterer Benutzernamen-Login benötigt einen gesondert freizugebenden Backend-Endpunkt mit mindestens:

- serverseitig geschützter, eindeutiger Benutzername-zu-Auth-Identität-Zuordnung,
- identischer Fehlermeldung für unbekannten Benutzernamen und falsches Passwort,
- Rate Limit, Abuse-/Brute-Force-Schutz und Auditierung ohne Passwörter,
- App Check bzw. gleichwertiger Missbrauchsbegrenzung,
- keiner öffentlichen Rückgabe von Benutzerlisten oder E-Mail-Verzeichnissen,
- keiner Speicherung oder Prüfung von Firestore-Passwörtern.

Die genaue Authentifizierungsmethode des Endpunkts muss separat sicherheitsgeprüft werden. Sie wurde in Phase 2 nicht implementiert.

## 6. Legacy-Migrationsstrategie

Keine reale Migration wurde implementiert oder ausgeführt. Vorgesehener späterer Ablauf:

1. Verifiziertes Backup und Restore-Test abschließen.
2. Profile aggregiert klassifizieren, ohne Passwortwerte auszulesen oder auszugeben.
3. Identität jedes Legacy-Benutzers über einen freigegebenen Prozess bestätigen.
4. Für den Benutzer ein Firebase-Auth-Konto durch Einladung/Passwort-Reset etablieren; kein Firestore-Passwort kopieren.
5. Eindeutigkeit von E-Mail, Benutzername, UID und vorhandenen Auth-Konten prüfen.
6. Serveradministriert `uid` im bestehenden Firestore-Dokument setzen, ohne dessen Dokument-ID zu ändern.
7. Serverseitig Claims `role` und bei abweichender Dokument-ID `profile_id` setzen.
8. Token-Neuausstellung erzwingen und Anmeldung im Staging-/Demoablauf testen.
9. Trainingsreferenzen unverändert lassen; eine getrennte, verifizierte `created_by_auth_uid`-Zuordnung vorbereiten.
10. Erst nach erfolgreicher Umstellung und gesonderter Freigabe ein Legacy-Passwortfeld löschen.

Notwendige serverseitige Funktionen – noch nicht implementiert:

- kontrollierte Einladung/Provisionierung von Auth-Konten,
- geprüfte Claim-Vergabe und Claim-Entziehung,
- sichere Legacy-Profilzuordnung,
- administrative Benutzerauflistung ohne Client-Collection-Read,
- optionaler Benutzername-Resolver,
- Konto-Deaktivierung und Widerruf aktiver Refresh Tokens,
- Audit-Logging ohne Geheimnisse oder vollständige Profildaten.

## 7. Testabdeckung und Ergebnisse

Ausgeführt wurde die vollständige Suite über den bestehenden fail-closed Runner:

```text
npm.cmd test
```

Finales Ergebnis: **57/57 Tests bestanden**.

- 43 bestehende Auth-, Regel-, Klassifikations-, Integritäts- und Sicherheitsprüfungen weiterhin bestanden.
- 14 neue Phase-2-Tests bestanden.

Neue Testfälle:

| Fall | Ergebnis |
|---|---|
| Modernes Auth-Konto, korrekte E-Mail/Passwort | Firebase Auth erfolgreich; gezieltes eigenes Profil geladen |
| Falsches Passwort | Durch Firebase Auth abgewiesen; kein Profilzustand |
| Browser-Neuladen | Observer stellt bestehende Auth-Sitzung wieder her |
| Sicherer Logout | Firebase-Sitzung beendet, Zustand `signed-out` |
| Legacy-Profil ohne Auth-Konto | Firebase Auth weist Anmeldung ab |
| Legacy-Dokument-ID ohne `profile_id` | Profilzugriff fail-closed; Logout |
| Legacy-Dokument-ID mit geprüftem `profile_id` | Bestehende ID und UID-Zuordnung funktionieren |
| Benutzername ohne Backend | Fail-closed abgewiesen |
| Fehlende/ungültige E-Mail und leeres Passwort | Vor Auth-Aufruf abgewiesen |
| Spieler | Fehlender Claim ergibt nur minimale Spielerrolle |
| Trainer/Admin | Nur jeweiliger serverseitiger Claim bestimmt die Rolle |
| Manipuliertes Firestore-Rollenfeld | Wird vom Flow nicht übernommen |
| Fehlender/falscher Claim | Keine privilegierte Rolle; Übungswrite durch Zielregeln abgewiesen |
| Passwortprofil/UID-Konflikt | Fail-closed mit Logout |
| Gesperrtes Konto | Auth-Fehler ohne Profilzugriff |
| Abgelaufene/entzogene Sitzung | `null` vom Observer beendet den Zustand |

Der erste Lauf hatte 56/57 bestandene Tests: Ein fehlendes Profil wurde von den Zielregeln als `permission-denied` statt als lesbares „existiert nicht“ behandelt und vom Flow absichtlich zu `profile-load-failed` abstrahiert. Der Test wurde auf diese datensparsame Semantik korrigiert; es wurde keine Regel gelockert.

JavaScript-Syntaxprüfungen für beide neuen Module und die Testdatei waren erfolgreich. Der Vite-Build war erfolgreich (`29 modules transformed`). Die erzeugten `dist`-Dateien wurden nach dem Build exakt auf den vorher nachweislich sauberen Stand zurückgestellt, damit keine nicht angeforderten Build-Artefakte im Arbeitsbaum verbleiben.

## 8. Noch nicht vollständig testbare Integrationsfälle

- Browser-Zurück/-Vorwärts wurde nicht als UI-End-to-End-Test aktiviert, weil der neue Flow `Backend/main.js` ausdrücklich nicht verändern darf. Der isolierte Flow greift nicht auf History oder Routing zu; die bestehende Routingkorrektur bleibt unverändert. Ein echter Navigationstest ist erst nach Freigabe eines separaten Test-Einstiegspunkts oder der späteren Integration sinnvoll.
- Echte serverseitig signierte Claims wurden im Auth Emulator für die tatsächliche Browseranmeldung nicht provisioniert. Claim-Auswertung und Firestore-Autorisierung wurden mit synthetischen, vom Rules-Test-Harness authentifizierten Kontexten geprüft. Die spätere Claim-Cloud-Function benötigt eigene Integrations- und Berechtigungstests.
- Konto-Deaktivierung wurde als injizierter Firebase-Auth-Fehler `auth/user-disabled` getestet. Eine serverseitige Deaktivierungsfunktion ist nicht vorhanden und wurde nicht implementiert.
- Ein echter Token-Ablauf über Zeit wurde nicht abgewartet. Das sicherheitsrelevante Observer-Verhalten bei einer entzogenen/ungültigen Sitzung wurde durch das Firebase-konforme `null`-Ereignis geprüft.

## 9. Risiken für bestehende Benutzer

- Legacy-Benutzer ohne Auth-Konto können sich nicht anmelden, bis ein sicherer Einladungs-/Resetprozess abgeschlossen ist.
- Legacy-Profile mit Passwortfeld bleiben unter den Zielregeln gesperrt; dies ist beabsichtigt und schützt vor Passwortoffenlegung.
- Fehlende oder falsche `profile_id`-/`uid`-Zuordnungen führen zum Logout statt zu einem unsicheren Fallback.
- Fehlende Rollen-Claims stufen auch bisherige Trainer/Admins auf Spielerrechte herab. Claims müssen vor Umschaltung vollständig inventarisiert und geprüft sein.
- Claims werden in ID-Tokens gecacht. Rollenänderung oder Entzug benötigt Token-Refresh beziehungsweise serverseitigen Refresh-Token-Widerruf.
- Der aktuelle Trainingscode schreibt noch kein verifiziertes `created_by_auth_uid`; Zielregeln würden neue/aktualisierte Trainings deshalb teilweise ablehnen.
- Die derzeitige Anwendung erwartet eine vollständige Benutzerliste. Unter Zielregeln ist diese clientseitig absichtlich gesperrt.

## 10. Freigabekriterien für eine spätere Umschaltung

- Produktives Backup und Restore-Test erfolgreich.
- Alle Profile eindeutig einem Auth-Konto oder einem dokumentierten Legacy-Fall zugeordnet.
- Keine ungeklärten Admin-/Trainerrollen.
- Serverseitige Claim- und Provisionierungsfunktionen implementiert, auditiert und separat getestet.
- Keine Anwendungskomponente liest `users` vor erfolgreicher Authentifizierung.
- Keine Anwendungskomponente liest, schreibt oder vergleicht Firestore-Passwortfelder.
- Trainingscode verwendet eine geprüfte Auth-UID-Eigentümerzuordnung, ohne bestehende Referenzen zu überschreiben.
- Benutzerverwaltung verwendet Backend-Funktionen statt direkter Collection-Reads/Writes.
- Reset-, Einladung-, Sperr- und Supportprozesse sind getestet.
- Browser-Neuladen, Zurück/Vorwärts, mehrere Tabs und Token-Refresh sind in einem isolierten UI-Test-Einstiegspunkt geprüft.
- Staging-/Demo-Abnahme für Spieler, Trainer, Admin, moderne Konten und sämtliche Legacy-Klassen erfolgreich.
- Monitoring, Wartungsmodus und sicherer Rückweg sind einsatzbereit.
- Separate ausdrückliche Freigabe für Frontend-Aktivierung, Datenmigration und Regelveröffentlichung liegt vor.

## 11. Rückgängig-Anleitung

Phase 2 ist einzeln rückgängig machbar:

1. Vorher `git status --short` prüfen.
2. Ausschließlich `Backend/secureAuthFlow.js` entfernen.
3. Ausschließlich `Backend/secureAuthAdapter.js` entfernen.
4. Ausschließlich `tests/firebase/secureAuthFlow.test.js` entfernen.
5. Ausschließlich `FIREBASE_AUTH_MIGRATION_PLAN.md` entfernen.

Keine Phase-1-Dateien, `node_modules`-Änderungen oder bestehenden Login-/Routing-Dateien zurücksetzen. Keine pauschalen `git reset`, `git clean` oder rekursiven Löschbefehle verwenden.

## 12. Produktionsstopp

Der neue Ablauf ist nicht aktiviert. `Backend/main.js` importiert weder `secureAuthFlow.js` noch `secureAuthAdapter.js`. Es besteht keine Freigabe für produktive Daten-, Konto-, Regel- oder Loginänderungen. Eine spätere Integration in `Backend/main.js` erfordert vorab einen konkreten Änderungsvorschlag und ausdrückliche Zustimmung.
