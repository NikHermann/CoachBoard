# Firebase Admin Provisioning – Phase 3

Stand: 16. November 2026
Status: **Nur lokal implementiert und im Demo-Emulator getestet. Nicht aus `functions/index.js` exportiert und nicht deploybar aktiviert.**

## 1. Sicherheitsgrenze

Phase 3 bereitet eine serverseitige Benutzer-, Rollen- und Legacy-Zuordnung mit Firebase Admin SDK vor. Es wurden keine produktiven Firebase-Dienste, Konten, Regeln, Trainings oder Übungen verändert. Es erfolgten weder Deployment noch Push, Commit oder reale Migration.

Der Adapter startet nur, wenn gleichzeitig gilt:

- Projekt-ID ist exakt `demo-coachboard-auth` und beginnt mit `demo-`,
- `FIREBASE_AUTH_EMULATOR_HOST` ist exakt `127.0.0.1:9099`,
- `FIRESTORE_EMULATOR_HOST` ist exakt `127.0.0.1:8080`.

`functions/index.js` importiert oder exportiert die neuen Module nicht. Damit existiert kein neuer erreichbarer Cloud-Functions-Endpunkt.

## 2. Ausgangszustand und Sicherung

- Branch: `fix/login-routing-2026-11-15`
- Commit: `b575a6577491db2ca40a1818720a6e77f6d3d42d`
- Remote-Referenz auf demselben Commit: `origin/fix/login-routing-2026-11-15`
- Bestehende Tags: `backup-before-firebase-emulator-phase1-2026-11-15`, `backup-before-login-routing-fix-2026-11-15`
- Vor Phase 3 vorhandene Änderungen: vier Dateien unter `node_modules`, `package.json`, `tests/firebase/testFirebase.js` und die uncommittierten Dateien aus Phase 1/2.
- Keine dieser Änderungen wurde zurückgesetzt oder überschrieben.

Ein neuer Commit, Stash oder Tag wurde nicht erzeugt, weil dies bei einem bereits veränderten Arbeitsbaum fremde Änderungen erfassen oder verschieben könnte. Phase 3 ist vollständig additiv und über die vier in Abschnitt 3 genannten Dateien einzeln rückgängig machbar.

Für echte Admin-SDK-Emulatortests wurden die bereits in `functions/package-lock.json` festgeschriebenen Dependencies lokal mit `npm.cmd --prefix functions ci` installiert. Package- und Lockfile blieben unverändert. npm meldete 29 bestehende Dependency-Hinweise (3 low, 26 moderate); es wurde bewusst kein automatisches `npm audit fix` ausgeführt.

## 3. Architektur und Dateien

### `functions/adminProvisioningService.js`

Injizierbarer CommonJS-Dienst mit folgenden Operationen:

- `createUser(caller, input)`
- `linkLegacyProfile(caller, input)`
- `setRole(caller, targetUid, role)`
- `revokePrivilegedRole(caller, targetUid)`
- `disableUser(caller, targetUid)`

Der Dienst enthält keine Firebase-Projektkonfiguration. Auth, Firestore und `FieldValue` werden serverseitig injiziert.

### `functions/adminProvisioningEmulator.js`

Isolierter Admin-SDK-Adapter:

- erzwingt Demo-Projekt und localhost-Emulatorhosts,
- initialisiert eine benannte Admin-App,
- verdrahtet Admin Auth und Admin Firestore mit dem Dienst,
- wird nicht aus `functions/index.js` exportiert.

### `tests/firebase/adminProvisioning.test.js`

15 Tests mit ausschließlich synthetischen Daten gegen Auth- und Firestore-Emulator.

### `FIREBASE_ADMIN_PROVISIONING_PLAN.md`

Diese Architektur-, Risiko- und Rücknahmedokumentation.

Unverändert blieben insbesondere:

- `functions/index.js`
- `functions/package.json` und `functions/package-lock.json`
- `Backend/main.js`
- bestehender Login und Routing
- `firestore.target.rules`
- `.firebaserc`, `firebase.json`, `firebase.emulator.json`

## 4. Berechtigungsprüfung

Jede administrative Operation ruft zuerst `assertAdminCaller()` auf. Die Prüfung verlangt gleichzeitig:

1. eine aufrufende Auth-UID,
2. `role == "admin"` im verifizierten Aufrufer-Token,
3. ein existierendes, nicht gesperrtes Auth-Konto,
4. `role == "admin"` in den aktuell serverseitig gespeicherten Custom Claims dieses Kontos.

Damit reicht weder ein manipuliertes Firestore-Profilfeld noch ein vom Browser behaupteter Tokeninhalt. Ein alter Token eines inzwischen herabgestuften Administrators scheitert an der aktuellen serverseitigen Benutzerprüfung.

Eigene Adminrolle und eigenes Administratorkonto können über den Dienst weder herabgestuft noch gesperrt werden. Ein Produktionssystem benötigt zusätzlich ein Vier-Augen-/Break-glass-Verfahren für Änderungen an Administratoren.

Eingehende Rollen werden ausschließlich gegen die feste Allowlist `spieler`, `trainer`, `admin` geprüft. Claims werden serverseitig aufgebaut; der Browser kann keine freien Claim-Objekte übergeben.

## 5. Sichere Kontoerstellung

`createUser()` führt folgende Reihenfolge aus:

1. Adminberechtigung prüfen.
2. E-Mail, Rolle, Benutzername und Verein normalisieren/validieren.
3. Hash-basierte E-Mail-Reservierung in `_adminProvisioningLocks` transaktional erwerben.
4. Doppelte Auth-E-Mail prüfen.
5. Auth-Konto zunächst `disabled: true` erstellen.
6. UID-basierte Profilreservierung erwerben und Profilkonflikt prüfen.
7. Serverseitige Claims setzen.
8. Passwortfreies Profil unter `users/{auth.uid}` erstellen.
9. Konto erst nach vollständigem Erfolg aktivieren.
10. Reservierungen freigeben.

Bei Fehlern wird ein neu angelegtes Profil entfernt und das neu angelegte Auth-Konto zunächst gesperrt, Refresh Tokens werden widerrufen und das Konto wird anschließend gelöscht. Passwörter werden weder entgegengenommen noch gespeichert.

## 6. Rollenänderung und Entziehung

`setRole()`:

- prüft Adminberechtigung und verhindert Selbstverwaltung,
- verlangt genau ein passwortfreies Profil mit `uid == targetUid`,
- setzt Claims aus einer festen Allowlist,
- aktualisiert das Profilrollenfeld nur als Anzeige-/Bestandsinformation,
- widerruft Refresh Tokens,
- stellt bei einem fehlgeschlagenen Profilwrite vorherige Claims und Profilrolle wieder her.

Das Firestore-Feld `role` bleibt keine Autorisierungsquelle. `firestore.target.rules` verwendet ausschließlich Token-Claims.

`revokePrivilegedRole()` setzt die Rolle serverseitig auf `spieler`. Dadurch bleibt das Konto nutzbar, verliert aber nach Token-Aktualisierung privilegierte Rechte.

## 7. Legacy-Zuordnung

`linkLegacyProfile()` erhält die bestehende Firestore-Dokument-ID. Es verlangt explizit:

- `identityVerified == true`,
- `emailVerified == true`,
- eindeutige, noch nicht verwendete E-Mail,
- existierendes, noch nicht zugeordnetes Profil,
- übereinstimmende Profil-/verifizierte E-Mail,
- kein vorhandenes Firestore-Passwortfeld,
- keine parallele Reservierung derselben E-Mail oder Profil-ID.

Der Ablauf erstellt das Auth-Konto zunächst gesperrt, setzt `role` und bei abweichender Dokument-ID `profile_id`, aktualisiert das bestehende Profil um `uid`/E-Mail/Rolle und aktiviert das Konto erst danach.

Passwortfelder werden nicht übernommen, kopiert, geloggt oder automatisch gelöscht. Ein Legacy-Profil mit Passwortfeld wird mit `legacy-password-cleanup-required` abgewiesen. Eine spätere echte Bereinigung benötigt Backup, gesonderte Freigabe und einen Prozess, der Passwortwerte niemals ausgibt.

Trainings- und Übungsdokumente werden von der Legacy-Funktion nicht gelesen oder geschrieben. Bestehende `created_by_user_id`, `exerciseIDs` und Dokument-IDs bleiben unverändert.

## 8. Parallelität und Idempotenz

E-Mail und Profil-ID werden über SHA-256-basierte Reservierungsdokumente transaktional geschützt. Zwei parallele Versuche derselben Identität können dadurch nicht beide erfolgreich sein. Der Test bestätigt: genau ein Konto wird erstellt, der zweite Versuch wird abgewiesen.

Restgrenze: Ein harter Prozessabbruch zwischen Reservierung und `finally` kann eine Reservierung hinterlassen. Vor einer produktiven Aktivierung werden benötigt:

- serverseitige TTL-/Ablaufzeit,
- Recovery-Job mit Operation-ID und Auditnachweis,
- idempotenter Request-Key,
- persistenter Operationsstatus (`pending`, `committed`, `rolled-back`, `manual-review`),
- Alarmierung für überfällige Operationen.

Ohne diese Ergänzungen ist das Modul ein lokaler Sicherheitsprototyp und kein freigegebener Produktionsdienst.

## 9. Kontosperrung und Tokens

`disableUser()` sperrt das Auth-Konto und widerruft Refresh Tokens. Neue Anmeldungen werden im Emulator abgewiesen.

Wichtige Grenze: Bereits ausgestellte Firebase-ID-Tokens behalten ihre enthaltenen Claims bis zur Aktualisierung oder zum Ablauf. `revokeRefreshTokens()` widerruft Refresh Tokens, macht ein bereits ausgestelltes ID-Token aber nicht automatisch für Firestore Rules ungültig. Der Test zeigt ausdrücklich:

- gecachtes Token behält zunächst die alte Rolle,
- erzwungener Token-Refresh übernimmt die neue Rolle,
- bei einer Herabstufung kann ein altes privilegiertes Token bis zum Ablauf alte Claims enthalten.

Vor Produktion ist daher eine Strategie erforderlich, zum Beispiel kurze Sitzungs-/Reauthentifizierungsfenster, serverseitige revocation-aware Endpunkte für kritische Aktionen und/oder ein zusätzliches serverseitig geprüftes Berechtigungsversionsmodell. Diese Entscheidung darf nicht allein durch Clientcode gelöst werden.

## 10. Fehler- und Rollback-Szenarien

| Fehler | Lokales Verhalten |
|---|---|
| Doppelte E-Mail | Abbruch vor Kontoerstellung |
| Profil existiert bereits | Abbruch und Rücknahme des neu erstellten Kontos |
| Auth-Erstellung schlägt fehl | Reservierung wird freigegeben; kein Profil |
| Profilwrite schlägt fehl | Konto wird gesperrt/widerrufen/gelöscht; kein Profilrest |
| Claim- oder Aktivierungsschritt schlägt fehl | Neues Konto und neu erstelltes Profil werden zurückgenommen |
| Legacy-Profilkonflikt | Abbruch vor Auth-Erstellung |
| Passwortfeld vorhanden | Sicherer Abbruch; keine automatische Übernahme/Bereinigung |
| Rollenprofilwrite schlägt fehl | Vorherige Claims und Profilrolle werden wiederhergestellt |
| Parallele Operation | Eine Operation gewinnt; weitere werden abgewiesen |
| Prozessabbruch außerhalb kontrollierter Fehlerbehandlung | Manuelle/TTL-Recovery noch erforderlich |

## 11. Testfälle und Ergebnisse

Neue Admin-SDK-Testfälle:

1. Kontoerstellung durch berechtigten Administrator.
2. Ablehnung nicht berechtigter bzw. nur clientseitig manipulierter Benutzer.
3. Rollen `spieler`, `trainer`, `admin` setzen und entziehen.
4. Selbstverwaltung eines Admins abweisen.
5. Legacy-Profil mit abweichender Dokument-ID sicher zuordnen.
6. Identitätsnachweis verlangen und Passwortprofil abweisen.
7. Doppelte E-Mail und Profilkonflikt abweisen.
8. Fehlgeschlagene Auth-Erstellung ohne Reste.
9. Fehlgeschlagener Profilwrite mit Auth-Rollback.
10. Fehlgeschlagene Rollenprofiländerung mit Claim-/Profilrollback.
11. Parallele Erstellung derselben Identität.
12. Gesperrter Benutzer kann sich nicht neu anmelden.
13. Rollenänderung/-entziehung nach Token-Refresh; alte Tokenwirkung sichtbar.
14. Trainings- und Übungsreferenzen bleiben unverändert.
15. Adapter verweigert fehlende Demo-/localhost-Isolation.

Ergebnis des abschließenden lokalen Emulatorlaufs:

- **15/15 neue Phase-3-Tests bestanden.**
- **72/72 Tests der vollständigen Regression bestanden**, 0 fehlgeschlagen, 0 übersprungen.
- Die protokollierten `PERMISSION_DENIED`-Antworten sind erwartete Ergebnisse der Negativtests.
- Ein vorheriger Zwischenlauf erreichte 69/72, weil drei Tests `firebase-admin` über einen testspezifischen Modulpfad importierten. Der Testadapter stellt den benötigten `FieldValue` nun selbst bereit; es wurde dafür keine Sicherheitsprüfung gelockert.

## 12. Offene Produktionsvoraussetzungen

- Kein HTTPS-/Callable-Endpunkt wurde implementiert. Vor einer Freigabe braucht jeder Endpunkt Schema-Validierung, App Check, Rate Limits, Auditierung und ein konsistentes Fehlerformat.
- Admin SDK darf nur in vertrauenswürdiger Serverumgebung laufen; niemals im Browser.
- Service Account/IAM muss Least Privilege erfüllen; lokale Emulatorinitialisierung ist kein Produktions-Credential-Design.
- Claims- und Profiländerungen benötigen persistentes Audit-Log mit Akteur, Ziel, Aktion, Ergebnis und Request-ID, ohne Passwörter.
- Lock-TTL, Operationsjournal, Recovery-Job und manuelle Review-Queue fehlen.
- E-Mail-/Identitätsverifikation und Einladung/Passwort-Setup benötigen einen geprüften realen Prozess.
- Admin-Lifecycle, Break-glass, Mehrpersonenfreigabe und Schutz des letzten Admins müssen definiert werden.
- Token-Revocation und sofortiger Rechteentzug benötigen eine explizite Architekturentscheidung.
- Bestehende Trainings benötigen weiterhin die geplante, geprüfte `created_by_auth_uid`-Zuordnung.
- Dependency-Audit der Functions-Abhängigkeiten muss vor Deployment bewertet werden; keine automatische Major-/Breaking-Aktualisierung.
- Node-Version lokal ist 22, während `functions/package.json` Node 24 fordert. Emulator-/Deployment-Laufzeit muss vor Freigabe angeglichen werden.

## 13. Rückgängig-Anleitung

Vor jeder Rücknahme `git status --short` prüfen. Ausschließlich Phase 3 entfernen:

1. `functions/adminProvisioningService.js`
2. `functions/adminProvisioningEmulator.js`
3. `tests/firebase/adminProvisioning.test.js`
4. `FIREBASE_ADMIN_PROVISIONING_PLAN.md`

`functions/node_modules` ist lokal installiert und Git-ignoriert; es kann separat nach Prüfung entfernt werden, ist aber keine Quellcodeänderung. Keine Phase-1/2-Dateien, bestehenden `node_modules`-Änderungen, Login-/Routingdateien oder Regeln zurücksetzen. Keine pauschalen `git reset`, `git clean` oder rekursiven Löschbefehle verwenden.

## 14. Produktionsstopp

Keine neue Funktion ist aus `functions/index.js` exportiert. Es besteht keine Freigabe für Deployment, produktive Claims, Kontenerstellung, Kontosperrung, Migration, Regelveröffentlichung oder Aktivierung des neuen Logins.
