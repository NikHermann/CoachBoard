# Login- und Routing-Korrektur

Stand: 15.11.2026

## A. Fehlerursache

### Nachgewiesene Ursachen

1. **Login konnte vor dem Laden der Benutzer ausgeführt werden.**  
   `bindEvents()` registrierte den Submit-Handler sofort. Der initiale Aufruf von `loadAll()` lief dagegen asynchron und wurde nicht gespeichert oder vom Login abgewartet. Während dieser Zeit war `state.users` noch leer. Ein frühes Absenden führte deshalb bei jedem gültigen Benutzernamen zur Meldung „Benutzername nicht gefunden.“

2. **Der Root-Pfad wurde beim Rendern in `/bibliothek` umgeschrieben.**  
   `render()` ruft immer `updateBrowserUrl()` auf. Für `state.activeView === "library"` lieferte `getRoutePathFromState()` ausschließlich `/bibliothek`. Da sowohl `/` als auch `/bibliothek` in `applyBrowserRoute()` dieselbe Ansicht darstellen, führte ein Render-Vorgang nach dem Einstieg über `/` zu `history.pushState(..., "/bibliothek")`.

### Unterschied zwischen `/` und `/bibliothek`

Beide URLs verwenden nachweislich dieselbe `Backend/index.html`, dasselbe Modul `Backend/main.js`, dieselbe Funktion `fetchUsers()` und dieselbe Firebase-Initialisierung aus `Backend/firebase.js`. Es gibt keine getrennte Login-Funktion pro Route. Der beobachtete Unterschied ist mit dem zeitabhängigen initialen Ladevorgang vereinbar; eine zusätzliche routenspezifische Authentifizierungsursache ist im lokalen Quellcode nicht vorhanden.

### Vermutungen, nicht nachgewiesen

- Unterschiedliche Netzwerk- oder Cache-Laufzeiten können beeinflusst haben, ob die Benutzerliste vor dem Absenden bereits geladen war.
- Der Zustand der veröffentlichten Website und mögliche Hosting-/Cache-Effekte wurden nicht live untersucht, da laut Auftrag weder die produktive Website noch der produktive Server verändert oder riskant getestet werden dürfen.

## B. Geänderte Dateien

### `Backend/main.js`

#### Initialen Ladevorgang für den Login abwarten

- **Betroffene Stellen:** globale Initialisierung, `loadAll()`, Login-Submit-Handler und Anwendungsstart
- **Ausgangssituation:** `loadAll({ applyRoute: true })` wurde ohne gespeichertes Promise gestartet. Der synchrone Login-Handler suchte unmittelbar in `state.users`.
- **Änderung:** Das Promise wird in `initialDataLoadPromise` gespeichert. Der Submit-Handler ist asynchron und wartet dieses Promise ab. `loadAll()` meldet mit `true` oder `false`, ob das Laden erfolgreich war. Bei einem Ladefehler erscheint eine passende Meldung anstelle des sachlich falschen „Benutzername nicht gefunden“.
- **Betroffene Zeilen nach der Änderung:** 10, 2460–2492, 2608–2622 und 3341
- **Grund:** Beseitigung des nachgewiesenen Race-Conditions beim ersten Login.
- **Mögliche Auswirkungen:** Ein während des Startladens abgesendeter Login wartet bis zum Abschluss. Das bestehende Verhalten nach erfolgreichem Laden sowie Benutzer-, Passwort- und Rollenprüfung bleiben unverändert.

#### Root-Pfad erhalten

- **Betroffene Funktion:** `getRoutePathFromState()`
- **Ausgangssituation:** Der Bibliothekszustand ergab immer `/bibliothek`.
- **Änderung:** Befindet sich die Anwendung bereits auf `/` und ist die Bibliothek aktiv, bleibt der Zielpfad `/`. Bei Navigation aus einer anderen Ansicht zur Bibliothek bleibt der vorhandene Zielpfad `/bibliothek` bestehen.
- **Betroffene Zeilen nach der Änderung:** 45–48
- **Grund:** Verhindert das unbeabsichtigte Umschreiben der offiziellen Hauptadresse bei Render-Vorgängen.
- **Mögliche Auswirkungen:** Keine Änderung an anderen Routen. `/` und `/bibliothek` bleiben gültige Einstiege in dieselbe Bibliotheksansicht.

### `LOGIN_FIX_DOKUMENTATION.md`

- **Änderung:** Diese Dokumentation wurde neu angelegt.
- **Grund:** Nachvollziehbarkeit von Ursache, Korrektur, Tests und Wiederherstellung.
- **Mögliche Auswirkungen:** Keine Laufzeitauswirkung.

## C. Testprotokoll

### Erfolgreich durchgeführt

- `node --check Backend/main.js`: JavaScript-Syntax ist gültig.
- `npm.cmd run build -- --outDir <temporärer Ordner> --emptyOutDir`: Vite-Produktions-Build erfolgreich; 29 Module transformiert. Das vorhandene `dist` wurde nicht verändert.
- Lokaler Vite-Smoke-Test:
  - `GET /` liefert HTTP 200 und das Login-Formular.
  - `GET /bibliothek` liefert HTTP 200 und dasselbe Login-Formular.
  - `GET /main.js` liefert HTTP 200 und enthält die Korrektur.
- `git diff --check`: keine Whitespace-Fehler.
- Statische Kontrolle: Es existiert nur ein Login-Submit-Handler; beide Routen verwenden denselben Einstieg und dieselbe Firebase-Konfiguration.

### Nicht durchgeführt

- Kein Login mit echten Zugangsdaten und keine Registrierung gegen die produktive Firebase-Datenbank.
- Keine schreibenden Tests für Benutzer, Trainings, Übungen oder Bibliothekseinträge.
- Kein Deployment und kein Test der veröffentlichten Website.
- Kein automatisierter Browser-End-to-End-Test, da im Projekt kein entsprechendes Testsystem vorhanden ist.

### Verbleibende Risiken

- Der interaktive Login mit realen Daten muss vor einer späteren Veröffentlichung in einer sicheren Testumgebung oder kontrolliert durch einen berechtigten Benutzer geprüft werden.
- Ein produktiver Browser- oder CDN-Cache kann erst nach einer späteren, ausdrücklich freigegebenen Veröffentlichung beurteilt werden.

## D. Wiederherstellungsanleitung

### Sicherung

- Ausgangscommit: `012bd9fe83236428188bbf91959eb0712916d98c`
- Lokaler Sicherungstag: `backup-before-login-routing-fix-2026-11-15`
- Der Arbeitsbaum war vor der Änderung sauber.

### Nur diese Änderungen zurücknehmen

Solange anschließend keine überlappenden Änderungen an `Backend/main.js` vorgenommen wurden:

```powershell
git restore --source backup-before-login-routing-fix-2026-11-15 -- Backend/main.js
Remove-Item -LiteralPath LOGIN_FIX_DOKUMENTATION.md
```

Diese Befehle betreffen nur die beiden oben genannten Dateien. Andere geänderte Dateien bleiben erhalten. Falls später weitere Änderungen in `Backend/main.js` vorgenommen wurden, darf `git restore` nicht ungeprüft verwendet werden. Dann zuerst den Diff anzeigen und ausschließlich die in Abschnitt B beschriebenen Hunks interaktiv oder manuell rückgängig machen:

```powershell
git diff backup-before-login-routing-fix-2026-11-15 -- Backend/main.js
```

Es wurde kein Sicherungs-Commit erstellt, damit keine fremden Änderungen aufgenommen werden. Der lokale Tag verweist exakt auf den unveränderten Ausgangscommit.

## E. Zusammenfassung

- **Geänderte Laufzeitdateien:** 1 (`Backend/main.js`)
- **Neu angelegte Dokumentationsdateien:** 1 (`LOGIN_FIX_DOKUMENTATION.md`)
- **Codeänderung in `Backend/main.js`:** 14 hinzugefügte, 2 entfernte Zeilen
- **Änderungen:** initiales Laden vor Login abwarten; Ladefehler eindeutig behandeln; Root-Pfad beim Rendern erhalten; Dokumentation ergänzen
- **Nicht verändert:** Firebase-Daten, Sicherheitsregeln, Berechtigungen, Zugangsdaten, Benutzerkonten, Trainingsdaten, Abhängigkeiten, Hosting und Deployment
- **Offene Punkte:** kontrollierter interaktiver Test mit berechtigtem Testkonto vor einer späteren Veröffentlichung

## Nachbesserung: Wiederholungsversuche und Mehrfach-Login

### Geänderte Stellen

- **Datei:** `Backend/main.js`
- **Zeile 11:** Der neue Status `loginInProgress` verhindert gleichzeitig laufende Login-Vorgänge.
- **Zeilen 2620–2658:** Der Login-Submit-Handler prüft den Status, startet nach einem fehlgeschlagenen Ladeergebnis genau einen neuen `loadAll({ applyRoute: true })`-Versuch und setzt den Schutz in `finally` zuverlässig zurück.
- Die Routing-Funktionen in den Zeilen 46–177 sowie der `popstate`-Handler ab Zeile 3352 wurden nicht verändert.

### Ursprüngliches Verhalten

Das gespeicherte `initialDataLoadPromise` blieb nach einem fehlgeschlagenen initialen Laden dauerhaft mit `false` erfüllt. Jeder weitere Login-Versuch wurde deshalb abgebrochen, ohne einen neuen Ladevorgang zu starten. Mehrere schnelle Submit-Ereignisse konnten außerdem gleichzeitig denselben Login-Ablauf ausführen.

### Neues Verhalten

- Ein erfolgreich abgeschlossenes initiales Promise wird weiterhin wiederverwendet; es entsteht kein zusätzlicher Ladevorgang.
- Ergibt das gespeicherte Promise `false`, ersetzt der nächste Login-Versuch es durch genau einen neuen `loadAll()`-Aufruf und wartet dessen Ergebnis ab.
- Schlägt auch dieser Versuch fehl, wird der Login beendet. Ein späterer Submit kann erneut laden.
- Solange ein Login einschließlich eines gegebenenfalls notwendigen Ladevorgangs läuft, werden weitere Submit-Ereignisse ohne zweiten Login- oder Ladevorgang beendet.
- `finally` setzt `loginInProgress` bei Erfolg, ungültigem Benutzernamen, falschem Passwort und Ladefehler wieder auf `false`.
- Benutzer- und Passwortvergleich sowie die Aktionen nach erfolgreichem Login wurden inhaltlich nicht verändert.

### Grund der Änderung

Die Nachbesserung ermöglicht eine Wiederherstellung nach einem vorübergehenden Ladefehler ohne Seiten-Reload und verhindert konkurrierende Login-Ausführungen. Sie ist auf den bestehenden Login-Handler und eine einzelne Statusvariable begrenzt.

### Durchgeführte Tests

- `node --check Backend/main.js`: erfolgreich.
- Vite-Produktions-Build in einem temporären Ausgabeordner: erfolgreich; 29 Module transformiert und das vorhandene `dist` nicht verändert.
- Kontrollierte Logiksimulation ohne Firebase-Zugriff:
  - erfolgreiches initiales Laden wird verwendet, ohne `loadAll()` erneut aufzurufen: erfolgreich;
  - fehlgeschlagenes gespeichertes Ergebnis, erster Wiederholungsversuch fehlgeschlagen, späterer Versuch erfolgreich: erfolgreich; zwei gezielte Ladeaufrufe und Freigabe des Guards bestätigt;
  - zwei gleichzeitige Submit-Versuche: nur der erste wurde ausgeführt, genau ein neuer Ladevorgang wurde gestartet und der Guard anschließend freigegeben.
- `git diff --check`: erfolgreich.
- Statische Diff-Kontrolle: Routing- und `popstate`-Logik sind gegenüber der ersten Korrektur unverändert.
- Kein echter Login, keine Registrierung und keine schreibende Firebase-Operation durchgeführt.

### Verbleibende Risiken

- Die Fehlerszenarien wurden mit einem isolierten Node-Logiktest des verwendeten Kontrollflusses simuliert, nicht als vollständiger Browser-End-to-End-Test.
- Ein interaktiver Test mit einem berechtigten Testkonto und kontrolliert simulierter Netzwerkunterbrechung bleibt vor einer Veröffentlichung empfohlen.
- Der Guard verändert die Oberfläche bewusst nicht; weitere Klicks während eines laufenden Login-Vorgangs werden still ignoriert.

### Nur diese Nachbesserung rückgängig machen

Der Stand unmittelbar vor der Nachbesserung wurde außerhalb des Projekts gesichert:

- `%TEMP%\coachboard-login-hardening-backup-2026-11-15\Backend-main-before-hardening.patch`
- `%TEMP%\coachboard-login-hardening-backup-2026-11-15\LOGIN_FIX_DOKUMENTATION-before-hardening.md`
- Rücknahmepatch nur für die Nachbesserung: `%TEMP%\coachboard-login-hardening-backup-2026-11-15\hardening-only.patch`
- SHA-256 des Rücknahmepatches: `6CBC290BE80DF7C7B5776381162CF59D8FF25EFDA13CB1C45E53D4ED849385FD`

Solange keine späteren überlappenden Änderungen an `Backend/main.js` vorgenommen wurden, lässt sich ausschließlich die Nachbesserung so zurücknehmen:

```powershell
git apply --check --reverse "$env:TEMP\coachboard-login-hardening-backup-2026-11-15\hardening-only.patch"
git apply --reverse "$env:TEMP\coachboard-login-hardening-backup-2026-11-15\hardening-only.patch"
```

Die ursprüngliche Login- und Routing-Korrektur bleibt dabei erhalten. Die Ergänzung dieses Dokumentationsabschnitts kann bei Bedarf separat entfernt oder mit der gesicherten Dokumentationskopie verglichen werden.

### Umfang der Nachbesserung

- `Backend/main.js`: 34 hinzugefügte und 16 entfernte Zeilen gegenüber dem gesicherten Zwischenstand; netto 18 zusätzliche Zeilen. Ein Großteil entsteht durch das Einrücken des unveränderten Login-Vergleichs in `try/finally`.
- Gesamtdifferenz von `Backend/main.js` gegenüber dem Ausgangscommit: 45 hinzugefügte und 15 entfernte Zeilen.
- Keine Änderung an Abhängigkeiten, Firebase-Konfiguration, Daten, Routen, Passwörtern oder Berechtigungen.
