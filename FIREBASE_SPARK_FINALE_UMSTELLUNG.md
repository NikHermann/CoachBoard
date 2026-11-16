# Finale Spark-Umstellung ohne produktive Admin-Functions

Stand: 16. November 2026

## Ergebnis und Sicherheitsgrenze

Die Benutzerverwaltung der Website benötigt im sicheren Firebase-Auth-Modus keine Cloud Functions mehr. Administrative Kontoverwaltung erfolgt ausschließlich mit `functions/adminCli.cjs` auf einem kontrollierten lokalen Rechner über Firebase Admin SDK und Application Default Credentials (ADC). Die Website enthält keinen Admin-SDK-Schlüssel, keine Admin-Zugangsdaten und keinen unsicheren Firestore-Ersatz.

Alle Implementierungs- und Regressionstests liefen ausschließlich mit `demo-coachboard-auth`, Auth-Emulator `127.0.0.1:9099` und Firestore-Emulator `127.0.0.1:8080`. Es gab keinen produktiven Firebase-Zugriff, keine Konto- oder Datenänderung, keine Regelveröffentlichung und kein Deployment. Auf dem Release-Branch steht `PRODUCTION_AUTH_ENABLED` auf `true`, bleibt aber technisch auf HTTPS und die Vereinsdomains begrenzt.

## Spark-kompatible Website

Im sicheren Modus funktionieren ohne Cloud Functions:

- Firebase-Auth-Login, Auth-Zustandswiederherstellung und Logout;
- Passwortänderung und Passwort-Reset über Firebase Authentication;
- gezielter Zugriff auf das eigene Profil;
- Rollenprüfung anhand serverseitig gesetzter Custom Claims;
- Bibliothek, eigene Trainings und Mustertrainings;
- rollenabhängiges Erstellen, Bearbeiten und Löschen von Trainings;
- historische `created_by_user_id`-Referenzen und neue `created_by_auth_uid`-Referenzen;
- Übungen und Übungsbibliothek gemäß `firestore.target.rules`;
- direkte Routen, Reload sowie Browser-Zurück/Vorwärts.

Administratoren sehen in der bisherigen Benutzerverwaltungsansicht ausschließlich:

> Die Benutzerverwaltung erfolgt über die geschützte Vereinsadministration.

Die sichere Website lädt keine vollständige Benutzerliste, ruft keine administrativen Callables auf und besitzt keinen administrativen Firestore-Fallback. Die unsichere Legacy-Verwaltung bleibt nur im unveränderten bisherigen Normalmodus enthalten; der spätere Produktionsschalter darf erst nach vollständiger Freigabe aktiviert werden.

Der vorhandene KI-Assistent bleibt wie zuvor ausschließlich lokal verfügbar und verwendet dort den Functions-Emulator. Er ist **nicht** produktiv Spark-kompatibel und wird in Produktion ausdrücklich abgewiesen. Eine produktive KI-Funktion benötigt eine separate kosten-, secret-, datenschutz- und autorisierungsgeprüfte Lösung.

## Lokales Admin-CLI

`functions/adminCli.cjs` verwendet die bestehende Logik aus `functions/adminProvisioningService.js` für:

- Auth-Konten anonymisiert auflisten, einschließlich fehlender oder gesperrter Profilzuordnungen;
- neue Konten ohne Admin-gesetztes Passwort anlegen;
- Profilfelder bearbeiten;
- Rollen `spieler`, `trainer` und `admin` setzen oder entziehen;
- Konten sperren und reaktivieren;
- Konten nur ohne Trainingsreferenzen kontrolliert löschen;
- vorhandene Auth-UIDs nach bestätigter Identitätsprüfung mit Profil-IDs verknüpfen.

Jede Aktion benötigt eine explizite, aus Projekt, Befehl und Ziel abgeleitete Bestätigungsphrase. Produktion erfordert zusätzlich zweimal `coachboarddb`, eine erwartete ADC-E-Mail-Adresse und eine technische Übereinstimmungsprüfung des ADC-Tokens. Das Programm initialisiert Firebase Admin erst nach der Aktionsbestätigung. Ausgaben enthalten UID, Profil-ID, Rolle, Status und Zuordnungsstatus, aber keine Namen, E-Mail-Adressen, Passwörter oder Tokens.

Der Service prüft den angegebenen ausführenden Admin zusätzlich gegen das aktuelle Auth-Konto, dessen Admin-Claim und das eindeutig verknüpfte Adminprofil. Selbstsperre, Selbstlöschung und Herabstufung der eigenen Adminrolle sind gesperrt. Dadurch bleibt bei der Änderung eines anderen Administrators mindestens der ausführende bestätigte Administrator erhalten. Bestehende fremde Custom Claims werden bei Rollenänderungen beibehalten; nur `role` und gegebenenfalls `profile_id` werden verwaltet.

## Befehle

### Emulator

Zuerst Auth- und Firestore-Emulator mit `demo-coachboard-auth` starten. In einem zweiten PowerShell-Fenster:

```powershell
$env:GCLOUD_PROJECT = "demo-coachboard-auth"
$env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
npm.cmd --prefix functions run admin:spark -- list --mode emulator --project demo-coachboard-auth --admin-uid <SYNTHETISCHE_ADMIN_UID>
```

`list` kann durch `create`, `update`, `role`, `disable`, `enable`, `delete` oder `link` ersetzt werden. Personenbezogene Eingaben werden interaktiv abgefragt und gelangen dadurch nicht in die Shell-History. Das CLI zeigt anschließend die exakt einzugebende Bestätigungsphrase an.

### Spätere Produktion – noch nicht freigegeben

Vorbereitung der ADC-Anmeldung auf dem kontrollierten Administrationsrechner:

```powershell
gcloud auth application-default login
gcloud config set project coachboarddb
gcloud auth list
```

Vor jedem CLI-Aufruf müssen Emulatorvariablen aus der Sitzung entfernt sein. Beispiel für eine später ausdrücklich freigegebene Read-only-Auflistung:

```powershell
Remove-Item Env:FIREBASE_AUTH_EMULATOR_HOST -ErrorAction SilentlyContinue
Remove-Item Env:FIRESTORE_EMULATOR_HOST -ErrorAction SilentlyContinue
npm.cmd --prefix functions run admin:spark -- list --mode production --project coachboarddb --confirm-project coachboarddb --operator-email <ADC_IDENTITAET> --admin-uid <BESTAETIGTE_ADMIN_UID>
```

Schreibende Befehle verwenden denselben Aufbau und fragen Ziel-UID sowie weitere Felder interaktiv ab. Diese Befehle wurden nicht gegen Produktion ausgeführt.

## Erforderliche Administratorrechte

Für das lokale Produktions-CLI wird eine namentlich zugeordnete, MFA-geschützte Google-Cloud-Identität mit zeitlich begrenzten Rechten empfohlen. Technisch benötigt sie:

- Firebase Authentication lesen und verwalten, typischerweise `roles/firebaseauth.admin`;
- Firestore-Dokumente lesen und schreiben, typischerweise `roles/datastore.user`.

Diese Standardrollen sind breiter als einzelne Collections. Deshalb sind organisatorische Least-Privilege-Maßnahmen erforderlich: dedizierte Operatorgruppe, zeitlich begrenzte IAM-Zuweisung, MFA, kontrollierter Rechner, Vier-Augen-Freigabe bei Löschung/Rollenänderung und anschließender Rechteentzug. Ein privater Service-Account-Schlüssel wird weder benötigt noch im Repository gespeichert.

## Geänderte Dateien

| Datei | Änderung |
|---|---|
| `functions/adminCli.cjs` | Neues interaktives Spark-Admin-CLI mit Projekt-, Emulator-, ADC-Identitäts- und Aktionsbestätigung. |
| `functions/package.json` | Befehl `admin:spark` ergänzt. |
| `functions/adminProvisioningService.js` | Auflistung nicht zugeordneter Konten ergänzt und fremde Custom Claims bei Rollenänderungen erhalten. |
| `Backend/main.js` | Sichere Adminansicht auf Vereinshinweis umgestellt; keine sichere Benutzerliste und keine Adminaktionen aus dem Browser. |
| `Backend/usersService.js` | Callable-Abhängigkeit entfernt; administrative Aufrufe im sicheren Website-Modus defensiv abgewiesen. |
| `functions/index.js` | Zuvor vorbereitete Admin-Callable-Exports wieder entfernt. Bestehende lokale KI-Testfunktionen bleiben unverändert. |
| `firebase.emulator.json` | Nicht mehr benötigten Functions-Port für die Benutzerverwaltung entfernt. |
| `tests/firebase/adminCli.test.js` | Projektisolation, Argumentprüfung, Bestätigungsbindung und anonymisierte Ausgabe getestet. |
| `tests/firebase/adminProvisioning.test.js` | Claim-Erhalt und Anzeige nicht zugeordneter Auth-Konten ergänzt. |

Die zuvor uncommittet vorbereiteten Dateien `Backend/adminUsersService.js`, `functions/adminCallableService.js` und `tests/firebase/adminCallableService.test.js` wurden entfernt, weil die Spark-Website sie nicht mehr benötigt.

## Tests

Ausgeführt:

```powershell
npm.cmd test
npm.cmd run build
```

Ergebnisse:

- Syntaxprüfung aller geänderten JavaScript-/CommonJS-Dateien: bestanden;
- vollständige Demo-Emulator-Regression: **93/93 Tests bestanden**, 0 fehlgeschlagen;
- CLI-Projektisolation, anonymisierte Ausgabe und Bestätigungsbindung: bestanden;
- Benutzeranlage, Rollenänderung mit Claim-Erhalt, Sperren/Reaktivieren, Löschschutz, Profilverknüpfung und Rollback: bestanden;
- Login, Logout, Passwort-Reset, Sitzungswiederherstellung und Legacy-Profil-ID: bestanden;
- Spieler-/Trainer-/Adminrechte, historische Trainingsreferenzen, Übungen, anonyme Zugriffe und unbekannte Collections: bestanden;
- Vite-Produktions-Build: bestanden, 33 Module transformiert.

Keine echte ADC-Identität, kein produktives IAM und kein produktives Konto wurden geprüft oder verwendet.

## Risiken und offene reale Voraussetzungen

Vor dem Release müssen konkret geprüft werden:

1. Jede aktive Auth-UID ist genau einem Firestore-Profil zugeordnet; bei abweichender Dokument-ID stimmen `profile_id` und Profilfeld `uid` überein.
2. Claim `role` und Profilrolle stimmen für alle aktiven Konten überein; mindestens ein geprüftes, aktives Administratorkonto bleibt bestehen.
3. Aktive Profile besitzen kein Firestore-Passwortfeld.
4. Historische `created_by_user_id`-Werte sind eindeutig; neue Trainings führen zusätzlich `created_by_auth_uid`.
5. ADC-Operator, IAM-Rollen, MFA, Vier-Augen-Ablauf und Entzug der temporären Rechte sind organisatorisch freigegeben.
6. Auth-Domains, Reset-E-Mail-Vorlage und E-Mail-Zustellung sind geprüft.
7. `firestore.target.rules` und Website werden aus demselben geprüften Release-Commit veröffentlicht.
8. Der KI-Assistent bleibt deaktiviert, solange keine separate Spark-kompatible Produktivlösung freigegeben ist.

## Geplanter Veröffentlichungsablauf

1. Read-only-Bestandsaudit ausführen und UID-/Profil-/Claim-/Trainingsabweichungen manuell klären.
2. Admin-CLI mit synthetischen Emulator-Daten und dem exakten Release-Commit erneut prüfen.
3. ADC/IAM auf dem kontrollierten Rechner zeitlich begrenzt einrichten; zunächst ausschließlich den `list`-Befehl freigeben.
4. Website-Build und Zielregeln gemeinsam abnehmen. Den Produktions-Auth-Schalter erst in einem ausdrücklich freigegebenen Commit aktivieren.
5. Restriktive Regeln und Hosting kontrolliert veröffentlichen; **keine Functions deployen**.
6. Login, Profil, Rollen, Bibliothek, historische/eigene Trainings, Übungen, Reset und Navigation mit freigegebenen Konten prüfen.
7. Erst danach einzelne CLI-Schreibaktionen nach Vier-Augen-Freigabe zulassen.

Ein Rückweg darf niemals öffentliche Vollzugriffsregeln aktivieren. Bei Problemen wird auf einen zuvor geprüften restriktiven Regelstand und den vorherigen Website-Build zurückgestellt.

## Endgültiger Vercel-/Firebase-Console-Release

Die produktive Website wird nachweislich von Vercel ausgeliefert. `vercel.json` legt deshalb `npm run build`, das Ausgabeverzeichnis `dist` und den SPA-Fallback auf `/index.html` fest. Firebase Hosting und Cloud Functions sind für den Website-Release nicht zu verwenden.

Vor dem Umschalten sind die realen Claims ohne produktiven Zugriff nicht feststellbar. Der konkrete manuelle Test lautet für je ein freigegebenes Spieler-, Trainer- und Administratorkonto:

1. In der aktuellen Firebase-Auth-Sitzung das ID-Token beziehungsweise dessen Claims kontrollieren.
2. `role` muss exakt `spieler`, `trainer` oder `admin` sein.
3. Wenn Firestore-Profil-ID und Auth-UID abweichen, muss `profile_id` exakt der bestehenden Profil-ID entsprechen; andernfalls muss `profile_id` fehlen und die Profil-ID der Auth-UID entsprechen.
4. Das Profil muss ein Feld `uid` mit der Auth-UID besitzen und darf kein Feld `password` enthalten.

Auswirkung fehlender Claims: Login und Lesen authentifizierter Trainings funktionieren mit einem ansonsten gültigen Profil weiterhin, die Rolle fällt im Frontend auf `spieler` zurück; Trainer- und Admin-Schreiboperationen werden von `firestore.target.rules` abgewiesen. Eine falsche oder fehlende `profile_id`-Zuordnung verhindert das Laden eines abweichend benannten Profils und damit die Anmeldung vollständig.

Nach bestätigten Zuordnungen sind exakt diese Schritte vorgesehen:

1. `Backend/productionAuthMode.js` enthält auf dem geprüften Release-Branch bereits `PRODUCTION_AUTH_ENABLED = true`.
2. `npm.cmd test` und `npm.cmd run build` erneut ausführen und den geprüften Commit über das bereits verbundene Vercel-Projekt veröffentlichen. Buildbefehl und Ausgabeverzeichnis werden aus `vercel.json` übernommen.
3. Den vollständigen Inhalt von `firestore.target.rules` in Firebase Console → Firestore Database → Rules einfügen, Änderungen prüfen und veröffentlichen. Nicht die bisherige öffentliche Regel wiederherstellen.
4. Spieler-, Trainer- und Admin-Login, Reset, Profil, Bibliothek, eigene/historische Trainings, Übungen, direkte Routen und Logout testen. Anonyme Firestore-Lese- und Schreibversuche müssen abgewiesen werden.

Der produktive KI-Assistent bleibt deaktiviert. `Backend/aiBackendService.js` initialisiert Firebase Functions außerhalb lokaler Entwicklung nicht mehr; dadurch löst auch ein versehentlicher Klick keinen produktiven Functions-Aufruf aus.

## Rückgängig machen

Vor einem Rückbau stets `git diff` prüfen. Die Spark-spezifischen Änderungen können gezielt zurückgenommen werden:

```powershell
git diff -- Backend/main.js Backend/usersService.js functions/adminProvisioningService.js functions/adminCli.cjs functions/package.json functions/index.js firebase.emulator.json tests/firebase/adminCli.test.js tests/firebase/adminProvisioning.test.js
git restore -- Backend/main.js Backend/usersService.js functions/adminProvisioningService.js functions/package.json functions/index.js firebase.emulator.json tests/firebase/adminProvisioning.test.js
Remove-Item -LiteralPath functions/adminCli.cjs,tests/firebase/adminCli.test.js,FIREBASE_SPARK_FINALE_UMSTELLUNG.md
```

Vorhandene Änderungen unter `node_modules/` und generierte `dist/`-Dateien dürfen dabei nicht pauschal zurückgesetzt werden. Es wurde kein Commit, Push oder Deployment durchgeführt.
