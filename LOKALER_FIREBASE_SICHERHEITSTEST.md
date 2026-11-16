# Lokaler Firebase-Sicherheitstest

Stand: 16. November 2026
Basis: Phase-4-Commit `ebb871d4a3dd1c858baa1b9611dd3474f1e00c2f`
Status: **Nur lokal. Kein Deployment, Push, Commit oder produktiver Firebase-Zugriff.**

## 1. Zweck und Sicherheitswirkung

Lokale Aufrufe auf `localhost`, `127.0.0.1` oder IPv6-Loopback dürfen die produktive Firebase-Konfiguration nicht mehr initialisieren. Vor `initializeApp()` wird deshalb geprüft:

- Mit exakt `?authMode=emulator` und HTTP-Loopback wird ausschließlich `demo-coachboard-auth` verwendet.
- Ohne Parameter oder mit einem falschen Wert wird die Initialisierung abgebrochen und eine verständliche Seite angezeigt.
- Auf einem öffentlichen Host ohne Testparameter bleibt der bisherige produktive Einstieg unverändert.
- Ein Testmodus auf einer öffentlichen Domain oder über HTTPS bleibt weiterhin gesperrt.
- Nicht erreichbare Emulatoren erzeugen keinen Fallback auf produktive Firebase-Dienste.

Die Sperre ist unabhängig vom Auth-Ablauf und liegt unmittelbar vor der Firebase-App-Initialisierung.

## 2. Geänderte Dateien

| Datei | Änderung |
|---|---|
| `Backend/localAuthTestMode.js` | Testbare Loopback-Sperre und eigener Fehlercode `local-firebase-mode-required` |
| `Backend/firebase.js` | Aufruf der Sperre vor `initializeApp()` und sichtbare Blockiermeldung |
| `tests/firebase/localAuthTestMode.test.js` | Tests für localhost ohne Parameter, falschen Parameter und unveränderten öffentlichen Normalmodus |
| `LOKALER_FIREBASE_SICHERHEITSTEST.md` | Prüf-, Browser- und Rücknahmedokumentation |

Die bereits vorhandenen Änderungen unter `node_modules` gehören nicht zu dieser Maßnahme und bleiben unangetastet. Es wurden keine Abhängigkeiten ergänzt.

## 3. Lokale Testbefehle

Syntax und Diff:

```powershell
node --check Backend/localAuthTestMode.js
node --check Backend/firebase.js
node --check tests/firebase/localAuthTestMode.test.js
git diff --check
```

Vollständige Emulator-Regression:

```powershell
npm.cmd test
```

Regelvarianten:

```powershell
npm.cmd run test:firebase:rule-variants
```

Build:

```powershell
npm.cmd run build
```

Manueller Browsertest verwendet ausschließlich:

```powershell
node node_modules/firebase-tools/lib/bin/firebase.js emulators:start --project demo-coachboard-auth --config firebase.auth-integration.emulator.json --only auth,firestore
npm.cmd run dev
```

Zulässige Test-URL:

```text
http://localhost:<vite-port>/?authMode=emulator
```

`http://localhost:<vite-port>/` muss die Blockiermeldung anzeigen und darf keine Firebase-Netzwerkanfrage erzeugen.

## 4. Vorhandene Browser-Testmöglichkeiten

Microsoft Edge ist lokal vorhanden. Playwright, Puppeteer, Selenium und ein passender Automationsrunner sind nicht installiert. Gemäß Sicherheitsvorgabe wurde keine Abhängigkeit installiert und keine Paketdatei geändert.

Für reproduzierbare automatisierte UI-Tests wäre vorzugsweise Playwright als Dev-Dependency einschließlich passendem Browser-Binary erforderlich. Vor einer solchen Installation sind eine gesonderte Freigabe, Dependency-Prüfung und Festlegung erforderlich, ob das vorhandene Edge oder ein von Playwright verwalteter Browser verwendet wird.

Bis dahin ist die folgende E2E-Matrix manuell mit ausschließlich synthetischen Emulator-Konten auszuführen. Nicht ausgeführte Punkte dürfen nicht als bestanden markiert werden.

## 5. Browser-E2E-Matrix

Vor jedem Lauf in den Browser-DevTools `Preserve log` aktivieren und Netzwerkprotokoll leeren.

| Fall | Durchführung | Erwartung |
|---|---|---|
| Lokale Sperre | localhost ohne Query öffnen | sichtbare Blockiermeldung; kein Firebase-Request |
| Öffentliche Aktivierung | Testmodus mit nicht lokalem Host simulieren/Unit-Test | Abbruch vor Firebase-Initialisierung |
| Login | synthetische E-Mail und korrektes Passwort | eigenes Profil und Bibliothek nach Auth laden |
| Falsches Passwort | gültige synthetische E-Mail, falsches Passwort | neutrale Ablehnung; keine Profildaten |
| Spieler | Konto mit `spieler`-Claim | keine Trainer-/Admin-Schreibrechte |
| Trainer | Konto mit `trainer`-Claim | vorgesehene Trainings-/Übungsrechte |
| Admin | Konto mit `admin`-Claim | Trainingsverwaltung; Client-Benutzerverwaltung bleibt deaktiviert |
| Reload | nach Login neu laden | Sitzung via `onAuthStateChanged`; Profil erneut gezielt laden |
| Zurück/Vorwärts | mehrere interne Routen navigieren | Route bleibt innerhalb aktueller Auth-/Rollenrechte |
| Training erstellen | synthetischer Trainer/Admin | `created_by_user_id` und passende `created_by_auth_uid` |
| Training bearbeiten | eigenes modernes Training | Eigentümerfelder unverändert |
| Historisches Training | `profile_id`-Claim und bestehende Profil-ID | Bearbeitung ohne Nachtragen/Ändern historischer Referenzen |
| Fremdes Training | anderer Trainer | Schreibzugriff abgewiesen |
| Fremdes Profil | direkte fremde Profil-ID | Firestore `PERMISSION_DENIED` |
| Passwort vergessen | E-Mail, Doppelklick | nur eine laufende Anforderung; stets neutrale Meldung |
| Logout | nach geladenen Daten abmelden | Auth-Sitzung und benutzerbezogener Speicher geleert |
| Netzwerk-Isolation | gesamten Lauf beobachten | nur localhost/127.0.0.1; kein `coachboarddb`/Google-Firebase-Produktendpunkt |

Die automatisierten Emulator-Sicherheitstests decken Auth, Claims, Profile, Regeln, Trainingsreferenzen, Reset und unerlaubte Zugriffe ab. Die tatsächliche DOM-Interaktion und Browser-History bleiben bis zu einem manuellen Lauf oder einer freigegebenen Automation offen.

## 6. Erfolgreiche und offene Prüfungen

Erfolgreich ausgeführt:

- isolierte Tests der lokalen Sperre: **5/5 bestanden**,
- vollständige Emulator- und Regressionstests: **78/78 bestanden**,
- Regelvarianten: **27/27 bestanden** (`8/8` Mitigation, `19/19` Target),
- JavaScript-Syntaxprüfung bestanden,
- Emulator-JSON syntaktisch gültig,
- `git diff --check` bestanden,
- Vite-Build erfolgreich; generierte `dist`-Artefakte anschließend auf den vorherigen Zustand zurückgesetzt.

Alle Firebase-Testläufe verwendeten ausschließlich `demo-coachboard-auth` und die lokalen Auth-/Firestore-Emulatoren.

Offen, solange kein Browserlauf erfolgt ist:

- tatsächliche Darstellung der Blockierseite in Edge,
- vollständiger Login-/Logout-Ablauf über DOM,
- Reload und History-Navigation im realen Browser,
- visuelle Rollenansichten,
- Formularabläufe für Training und Passwort-Reset,
- Browser-Netzwerkaufzeichnung als zusätzlicher Nachweis.

## 7. Rückgängig-Anleitung

Es wurden keine Daten verändert; ein Datenrollback ist nicht erforderlich.

1. Änderungen an `Backend/localAuthTestMode.js`, `Backend/firebase.js` und `tests/firebase/localAuthTestMode.test.js` auf Commit `ebb871d` zurücksetzen.
2. Diese Dokumentationsdatei entfernen.
3. Die vier bereits vorher vorhandenen Änderungen unter `node_modules` nicht zurücksetzen oder committen.
4. Syntax-, Build- und vollständige Emulator-Regression erneut ausführen.

Das Rückgängigmachen entfernt nur die lokale Fail-closed-Sperre. Es verändert weder den öffentlichen produktiven Einstieg noch Firebase-Daten oder Regeln.

## 8. Routing-Fix: Emulator-Modus bei Navigation erhalten

### Ursache

`updateBrowserUrl()` übergab bisher ausschließlich den von `getRoutePathFromState()` ermittelten Pfad an `history.pushState()` beziehungsweise `history.replaceState()`. Ein Aufruf wie `/training/neu` ersetzte daher die aktuelle URL vollständig und entfernte `?authMode=emulator`. `applyBrowserRoute()` und der `popstate`-Handler lesen nur den Pfad und waren nicht ursächlich.

### Änderung

Geändert wurde ausschließlich `Backend/main.js` in `updateBrowserUrl()`:

- Im lokalen, bereits sicher validierten Emulator-Modus wird die vorhandene Query einschließlich aller Parameter und ein vorhandener Hash an den neuen Pfad angehängt.
- Im normalen produktiven Modus wird weiterhin unverändert ausschließlich `nextPath` verwendet.

Alter lokaler Ablauf:

```text
/?authMode=emulator -> /training/neu -> Reload wird lokal blockiert
```

Neuer lokaler Ablauf:

```text
/?authMode=emulator -> /training/neu?authMode=emulator -> Reload bleibt im Demo-Emulator
```

Weitere Query-Parameter bleiben in ihrer bestehenden Reihenfolge und Kodierung erhalten. Zurück/Vorwärts verwendet die bereits mit Query gespeicherten History-Einträge. Die Prüfungen in `localAuthTestMode.js` wurden weder geändert noch gelockert.

### Testergebnisse nach dem Routing-Fix

- JavaScript-Syntaxprüfung bestanden.
- Lokale Sicherheitsprüfungen: **5/5 bestanden**.
- Vollständige Emulator-/Regressionstests: **78/78 bestanden**.
- Regelvarianten: **27/27 bestanden**.
- Vite-Build erfolgreich; `dist` anschließend wieder unverändert.
- `git diff --check` bestanden.

Die bereits manuell bestätigten Funktionen Login, Profilladen, Bibliothek, Trainingserstellung und „Meine Trainings“ stammen aus dem Browserlauf vor diesem Routing-Fix. Die konkrete Query-Erhaltung bei Navigation, History und Reload ist mangels installierter Browser-Automation anhand des folgenden Edge-Ablaufs noch manuell zu bestätigen.

### Sicherheitsauswirkung

- Direkte lokale Aufrufe ohne `authMode=emulator` bleiben vor Firebase blockiert.
- Ungültige Werte bleiben blockiert.
- Öffentliche Hosts können den Emulator-Modus weiterhin nicht aktivieren.
- Es gibt weiterhin keinen produktiven Fallback.
- Der produktive Routing-Ablauf ohne lokalen Testmodus ist bytegleich zum bisherigen Zielwert `nextPath`.

### Manueller Microsoft-Edge-Test

1. Emulatoren mit dem Befehl aus Abschnitt 3 starten.
2. Vite mit `npm.cmd run dev` starten.
3. Edge-InPrivate öffnen und DevTools/Netzwerk mit `Preserve log` aktivieren.
4. `http://localhost:5173/?authMode=emulator` öffnen und mit einem synthetischen Trainerkonto anmelden.
5. Bibliothek, „Training erstellen“ und „Meine Trainings“ öffnen. Nach jedem Schritt muss `authMode=emulator` in der URL stehen.
6. Browser-Zurück und Vorwärts verwenden; jeder History-Eintrag muss den Parameter behalten.
7. `/meine-trainings?authMode=emulator` und `/training/neu?authMode=emulator` jeweils neu laden.
8. `http://localhost:5173/meine-trainings` ohne Query öffnen: Blockiermeldung, keine Firebase-Anfrage.
9. `http://localhost:5173/meine-trainings?authMode=ungueltig` öffnen: Blockiermeldung, keine Firebase-Anfrage.
10. Im Netzwerkfilter sicherstellen, dass nur `127.0.0.1:9099`, `127.0.0.1:8080` und der lokale Vite-Host vorkommen; insbesondere keine Anfrage an `coachboarddb` oder produktive Firebase-Endpunkte.

Rückgängig: Die lokale Variable `nextUrl` entfernen und im History-Aufruf wieder `nextPath` statt `nextUrl` übergeben. Alle übrigen Sicherheitsänderungen bleiben dabei erhalten.
