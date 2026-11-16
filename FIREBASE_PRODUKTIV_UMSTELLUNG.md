# Firebase Auth und Firestore – Vorbereitung der produktiven Umstellung

Stand: 16. November 2026

## Status und Sicherheitsgrenze

Die produktionsfähige Variante ist auf dem lokalen Release-Branch aktiviert. `PRODUCTION_AUTH_ENABLED` steht auf `true`, greift jedoch ausschließlich auf HTTPS und den fest erlaubten Vereinsdomains. Ein URL-Parameter kann den Modus nicht auf fremden Hosts oder localhost aktivieren. Der Release wurde noch nicht veröffentlicht.

Es gab keinen Zugriff auf produktive Firebase-Daten, keine Änderung eines Kontos, Claims, Trainings oder einer Übung, keine Regelveröffentlichung, keinen echten Passwort-Reset, keinen Commit, Push und kein Deployment.

## Geänderte Dateien

| Datei | Änderung | Grund |
|---|---|---|
| `Backend/main.js` | Gemeinsamer `isSecureAuthMode` für Emulator und die später freizugebende Produktionsvariante; Firebase-Login, Auth-Observer, Logout, Reset, gezieltes Profilladen und `created_by_auth_uid` werden darüber verwendet. Clientseitige Registrierung, Rollen- und Benutzerverwaltung bleiben im sicheren Modus gesperrt. | Der getestete sichere Ablauf soll ohne unsicheren Firestore-Passwort-Fallback produktiv nutzbar sein. |
| `Backend/productionAuthMode.js` | Neue, standardmäßig deaktivierte Release-Sperre; eine spätere Aktivierung ist nur auf HTTPS und `tsv-trainingsplatz.at` beziehungsweise `www.tsv-trainingsplatz.at` zulässig. | Kein URL-Parameter und kein gewöhnlicher Push darf den Produktionsmodus einschalten. |
| `firestore.target.rules` | Profilerstellung und fremde Profilabfragen gesperrt; Trainingswrites auf Trainer-Eigentümer beziehungsweise Admins begrenzt; Eigentümerfelder unveränderbar; Mustertrainings nur für Admins. | Clientzugriffe erhalten nur die tatsächlich von der Anwendung benötigten Rechte. |
| `tests/firebase/productionAuthMode.test.js` | Tests für deaktivierten Schalter, URL-Unwirksamkeit und Host-/HTTPS-Bindung. | Regression der Aktivierungsgrenze. |
| `tests/firebase/firestoreTargetRules.test.js` | Erwartung für neue Profile auf sichere Ablehnung umgestellt. | Regression der neuen Profilerstellungssperre. |
| `FIREBASE_PRODUKTIV_UMSTELLUNG.md` | Diese Freigabe-, Risiko- und Rücknahmedokumentation. | Nachvollziehbare, einzeln rückgängig machbare Vorbereitung. |
| `dist/index.html`, `dist/assets/index-*.js`, `dist/assets/index-*.css` | Durch den erfolgreichen Vite-Produktions-Build neu erzeugte Artefakte mit inaktivem Produktionsschalter. | Reproduzierbarer Build-Nachweis; keine Veröffentlichung. |

Bereits vorhandene Änderungen an `Backend/firebase.js`, `Backend/localAuthTestMode.js`, Routingtests, Auditdateien und `node_modules` stammen aus vorherigen Arbeitsständen und wurden nicht überschrieben. `Backend/index.html`, `Backend/secureAuthFlow.js`, `Backend/secureAuthAdapter.js`, `Backend/authService.js`, `.firebaserc` und `firebase.json` mussten für diese Phase nicht geändert werden.

Konkrete Quellstellen im aktuellen Arbeitsstand:

- `Backend/main.js:11-13`: Produktionsmodus importieren und sicheren Modus bilden.
- `Backend/main.js:112-118`, `644-650`, `2937-2944`, `2964-2972`, `3013-3021`, `3062-3070`: unsichere Benutzer- und Rollenverwaltung im sicheren Modus sperren.
- `Backend/main.js:2553-2604`: geschützte Datenladung und Firebase-Auth-Observer aktivieren.
- `Backend/main.js:2724-2805`: Firebase-Login und neutralen Passwort-Reset verwenden.
- `Backend/main.js:2870-2935`: geschützte Profil- und Firebase-Passwortänderung.
- `Backend/main.js:3480-3488`: Auth-UID bei neuen Trainings ergänzen und historische Referenzen erhalten.
- `Backend/main.js:3513-3523`, `3550-3557`: sicherer Logout und explizite Modusauswahl.
- `Backend/productionAuthMode.js:1-20`: deaktivierter, hostgebundener Produktionsschalter.
- `firestore.target.rules:68-75`: Client-Profilerstellung sperren.
- `tests/firebase/productionAuthMode.test.js:1-44`: Aktivierungsgrenzen testen.
- `tests/firebase/firestoreTargetRules.test.js:105-126`: Ablehnung neuer Clientprofile testen.

## Alter und vorbereiteter Anmeldeablauf

### Aktuell produktiv – unverändert

Auf dem Release-Branch verhindert `PRODUCTION_AUTH_ENABLED === true` den bisherigen öffentlichen Firestore-Login und aktiviert Firebase Authentication. Der derzeit veröffentlichte Stand bleibt bis zum kontrollierten Vercel-Release unverändert.

### Vorbereiteter Zielablauf

1. `onAuthStateChanged` stellt die Firebase-Auth-Sitzung bei Login, Reload und Navigation wieder her.
2. Login erfolgt ausschließlich mit E-Mail und Passwort über Firebase Authentication.
3. Nach erfolgreicher Authentifizierung werden ID-Token und serverseitige Claims gelesen.
4. Ohne `profile_id`-Claim wird das Profil unter der Auth-UID geladen. Mit `profile_id`-Claim wird genau die serverseitig bestätigte Legacy-Dokument-ID geladen.
5. Das Profil muss ein `uid`-Feld besitzen, das exakt der Auth-UID entspricht. Profile mit Passwortfeld oder UID-Konflikt werden abgewiesen und die Auth-Sitzung wird beendet.
6. Die Rolle stammt nur aus `role` im ID-Token. Profil- oder Browserrollen gewähren keine zusätzlichen Rechte. Fehlende oder ungültige Claims fallen auf die minimale Spielerrolle zurück; Firestore-Regeln erteilen dadurch keine Trainer- oder Adminrechte.
7. Erst danach werden Trainings geladen. Eine vollständige Benutzerliste wird nicht geladen.
8. Logout beendet Firebase Auth und leert Trainings, Benutzer, Übungen, Auswahl- und Formularzustände im Browser.

Es gibt im sicheren Modus keinen Firestore-Passwortvergleich, keinen Benutzernamen-Resolver und keinen Legacy-Fallback.

## Profil- und Trainingszuordnung

Unterstützt werden genau zwei Fälle:

- Firestore-Dokument-ID entspricht der Firebase-Auth-UID und `users/{uid}.uid == uid`.
- Die Dokument-ID weicht ab; dann muss ein serverseitiger `profile_id`-Claim exakt diese ID nennen und das Profilfeld `uid` muss trotzdem der Auth-UID entsprechen.

Neue Trainings behalten `created_by_user_id` mit der vorhandenen Profil-ID und erhalten zusätzlich `created_by_auth_uid` mit der Firebase-UID. Historische Trainings werden nicht umgeschrieben. Bei Aktualisierungen bleiben beide Eigentümerfelder unverändert. Historische Trainings ohne Auth-UID bleiben nur dann bearbeitbar, wenn `created_by_user_id` der serverseitig bestätigten Profil-ID entspricht.

Vor der Umschaltung muss der vorbereitete Read-only-Audit bestätigen:

- jedes aktive Auth-Konto hat genau ein passwortfreies Profil;
- jede abweichende Dokument-ID besitzt den richtigen `profile_id`-Claim;
- Rollen-Claims sind vorhanden und entsprechen der freigegebenen Rolle;
- historische Trainingsbesitzer sind eindeutig zuordenbar;
- deaktivierte, fehlende und widersprüchliche Konten sind geklärt.

## Firestore-Zielregeln

`firestore.target.rules` setzt voraus:

- anonyme Zugriffe sind vollständig gesperrt;
- Profile sind nur gezielt für den jeweiligen Besitzer lesbar; administrative Abfragen müssen serverseitig erfolgen;
- Collection-Listing von Benutzern ist auch für Admin-Clients gesperrt;
- Passwortprofile bleiben gesperrt;
- Besitzer dürfen nur Benutzername und Verein ändern;
- Client-Profilanlage, Rollenänderung und Löschung sind gesperrt;
- Trainings sind nur für authentifizierte Konten lesbar;
- neue Trainings dürfen nur Trainer oder Admins erstellen und müssen Auth-UID sowie bestätigte Profil-ID enthalten;
- Trainingsbesitz kann nicht vom normalen Client übertragen werden;
- Spieler besitzen ausschließlich Leserechte auf Trainings; Trainer ändern/löschen nur eigene Nicht-Mustertrainings; Admins verwalten alle Trainings, ohne Eigentümerfelder zu verändern;
- Übungen sind authentifiziert lesbar und nur mit Trainer- oder Admin-Claim schreibbar;
- unbekannte Collections sind vollständig gesperrt.

Die lokale Änderung an den Zielregeln wurde nicht veröffentlicht.

## Passwort vergessen und Passwortänderung

Der vorhandene Button wird im sicheren Modus eingeblendet. Er verlangt eine syntaktisch gültige E-Mail-Adresse, verhindert paralleles Mehrfachabsenden und ruft ausschließlich Firebase `sendPasswordResetEmail()` auf. Erfolg und Fehler erzeugen dieselbe neutrale Rückmeldung. Es werden weder Benutzerlisten noch Passwortfelder geladen und keine Passwörter per E-Mail verschickt.

Die eigene Passwortänderung nutzt Firebase-Reauthentifizierung und `updatePassword()`. Der bisherige Firestore-Passwortpfad ist im sicheren Modus nicht erreichbar.

Ein echter Reset-Versand wurde nicht getestet. Vor Freigabe müssen Absender, E-Mail-Vorlage, autorisierte Domain und Action-URL im produktiven Firebase-Projekt kontrolliert werden.

## Funktionskompatibilität

| Funktion | Vorbereiteter Status | Voraussetzung/Risiko |
|---|---|---|
| Login, Reload, Zurück/Vorwärts, direkter Routenaufruf | Lokal funktionsfähig | Produktionsdomain und Kontozuordnung bestätigen. |
| Logout | Lokal funktionsfähig | Keine weitere Voraussetzung. |
| Passwort-Reset | Lokal im Emulator funktionsfähig | Echter Versand benötigt gesonderte Freigabe und Konfigurationsprüfung. |
| Bibliothek, Meine Trainings, Mustertrainings | Lokal kompatibel | Zielregeln und eindeutige Besitzerzuordnung müssen veröffentlicht sein. |
| Training erstellen/bearbeiten | Lokal kompatibel für Trainer und Admins; Spielerzugriff wird in UI und Regeln gesperrt | Neue Dokumente benötigen beide Besitzerfelder. Historische IDs bleiben bestehen. |
| Training löschen | Trainer löschen eigene Nicht-Mustertrainings regeltechnisch; die aktuelle UI bietet Löschen weiterhin nur Admins an | Kein Sicherheitsproblem, aber bestehende UI ist restriktiver als die Regeln. |
| Übungen lesen | Kompatibel für authentifizierte Konten | Vollständiger Browsertest erforderlich. |
| Übungen bearbeiten | Regeln erlauben nur Trainer/Admin | Spieler-UI kann weiterhin Bedienelemente zeigen; der Server verweigert den Write. UX vor Freigabe prüfen. |
| Eigenes Profil | Benutzername/Verein kompatibel; Passwort über Auth | E-Mail-, UID- und Rollenänderung sind absichtlich nicht als Client-Write möglich. |
| Trainer-/Adminrechte | Claim-basiert vorbereitet | Produktive Claims müssen bestätigt und Token nach Claim-Änderung erneuert werden. |
| Benutzerverwaltung | Admins sehen eine ausdrückliche Sperrmeldung; direkte Browseraktionen sind deaktiviert | Der vorhandene Admin-Service ist noch nicht als autorisierter produktiver Endpoint in `functions/index.js` angebunden. |
| KI-Trainingsassistent | Unverändert nur lokal verfügbar | `generateTrainingPlan` verweigert Produktion sowohl im Frontend als auch serverseitig. Eine produktive Freigabe ist ein separates Sicherheitsprojekt. |

Keine Funktion wurde stillschweigend entfernt. Nicht kompatible administrative Schreibformulare sind im sicheren Modus ausgeblendet und ihre Event-Handler lehnen direkte Aufrufe zusätzlich ab. Die Benutzerverwaltung selbst bleibt für Admins erreichbar und erklärt die noch fehlende Serveranbindung ausdrücklich.

## Kritische Blocker vor Aktivierung

1. **Produktiver Read-only-Audit:** UID-, Profil-, Claim- und Trainingszuordnungen sind noch nicht bestätigt.
2. **Aktuelle öffentliche Regeln:** Die produktiven Firestore-Regeln wurden nicht geprüft oder geändert. Der sichere Frontendmodus darf nicht ohne abgestimmte Zielregeln freigegeben werden.
3. **Auth-Selbstregistrierung:** Das Ausblenden der Registrierung verhindert keine direkten Firebase-Auth-API-Aufrufe. Vor Freigabe muss serverseitig geklärt sein, wie unerlaubte Kontoerstellung verhindert wird, beispielsweise über eine freigegebene Blocking Function/Identity-Platform-Konfiguration. Die Zielregeln verhindern immerhin, dass ein solches Konto selbst ein Profil anlegt.
4. **Benutzerverwaltung:** Für Auflistung, Erstellung, Sperrung, Rollenänderung und Löschung fehlt die produktiv angebundene, authentifizierte Admin-API. Direkte Browserwrites bleiben verboten.
5. **Browser-End-to-End-Test:** Alle kritischen Funktionen müssen mit synthetischen Konten gegen exakt den späteren Release-Build und die Zielregeln geprüft werden.
6. **Reset-Konfiguration:** Autorisierte Domain, E-Mail-Vorlage und Action-URL sind noch nicht produktiv bestätigt.

## Ausdrücklicher Umschaltmechanismus

Die einzige Codefreigabe ist in `Backend/productionAuthMode.js`:

```js
export const PRODUCTION_AUTH_ENABLED = true;
```

Ein späterer, separat geprüfter Release ändert genau diesen Wert auf `true`. Der Resolver akzeptiert danach ausschließlich HTTPS auf den beiden fest eingetragenen Vereinsdomains. Query-Parameter, localhost, Firebase-Hosting-Vorschau-URLs und fremde Domains aktivieren den Modus nicht.

Das Ändern des Schalters allein ist noch keine Veröffentlichungsfreigabe. Es benötigt einen eigenen Diff, Build, Regression, Vier-Augen-Freigabe und explizites Deployment.

## Veröffentlichungsplan

1. Wiederherstellbares Firestore-Backup erstellen und Restore in einem getrennten Testprojekt nachweisen.
2. Read-only-Audit freigeben und aggregierte Ergebnisse prüfen. Bei jeder Uneindeutigkeit abbrechen.
3. Auth-Provider, autorisierte Domains, Reset-Mail und Schutz gegen Selbstregistrierung bestätigen.
4. Claims und `profile_id` aller aktiven Konten im Vier-Augen-Prinzip bestätigen. Keine automatische Migration.
5. Falls Benutzerverwaltung zum Start erforderlich ist: serverseitigen Admin-Endpoint implementieren, im Emulator testen, separat freigeben und vor dem Frontend bereitstellen.
6. Release-Kopie erstellen, ausschließlich den Produktionsschalter aktivieren und daraus einen unveränderlichen Build erzeugen.
7. Browser-E2E mit synthetischen Konten und `firestore.target.rules` vollständig wiederholen.
8. Kontrolliertes Wartungsfenster ankündigen. Frontend und Zielregeln als zusammengehöriges Release veröffentlichen; das Zeitfenster zwischen beiden muss minimal und überwacht sein. Zielregeln zuerst würden den alten Login aussperren, Frontend zuerst lässt die aktuelle Regelunsicherheit kurz weiterbestehen. Daher ist ein vorbereiteter Wartungs-/Sperrbildschirm die sicherste Zwischenstufe.
9. Smoke-Tests für Spieler, Trainer und Admin durchführen; Permission-Denied-, Auth-, Reset- und Function-Fehler überwachen.
10. Erst nach bestandenen Smoke-Tests die Wartungsseite entfernen.

Es wurde keiner dieser produktiven Schritte ausgeführt.

## Freigabe- und Abbruchkriterien

Freigabe nur, wenn:

- Audit keine ungeklärten aktiven Mappings oder Besitzerreferenzen meldet;
- alle aktiven Rollenclaims bestätigt sind;
- Backup und Restore nachgewiesen sind;
- Auth-Selbstregistrierung kontrolliert ist;
- Zielregeln und Release-Build dieselbe getestete Version verwenden;
- alle kritischen Browserfälle bestanden sind;
- ein sicherer Rollback-Build und eine Wartungsseite bereitliegen.

Sofortiger Abbruch bei Login-/Profilfehlern eines aktiven Kontos, unerwarteten Permission-Denied-Spitzen, fehlenden Trainings, Eigentümerkonflikten, möglicher Rolleneskalation, produktiven Kontakten während lokaler Tests oder Abweichung der Projektkennung.

## Rücknahme ohne Datenverlust

### Lokale Vorbereitung

Die Änderungen sind dateiweise rücknehmbar: Produktionsschalter und Test entfernen, die genannten `main.js`-Bedingungen zurücknehmen, Profil-Create-Regel und zugehörigen Test auf den vorherigen Stand setzen und diese Dokumentation entfernen. Bereits vorhandene Änderungen dürfen nicht zurückgesetzt werden.

### Nach einer späteren produktiven Umschaltung

- Firestore-Zielregeln bleiben restriktiv. Ein Rollback darf niemals öffentliche Vollzugriffsregeln wiederherstellen.
- Bei Frontendfehlern wird auf einen zuvor getesteten sicheren Firebase-Auth-Build oder auf eine statische Wartungsseite zurückgeschaltet, nicht auf den Firestore-Passwortlogin unter offenen Regeln.
- Konten, Claims, Profile, Trainings und Übungen werden nicht automatisch zurückmigriert.
- Regelrollback ist nur auf eine separat getestete restriktive Regelversion zulässig.
- Der Produktionsschalter kann in einem neuen geprüften Build wieder deaktiviert werden; unter den Zielregeln ist der alte Login dann jedoch nicht funktionsfähig. Deshalb ist die Wartungsseite der sichere Zwischenzustand.

## Tests

Ausgeführt ausschließlich mit `demo-coachboard-auth`, Auth Emulator `127.0.0.1:9099` und Firestore Emulator `127.0.0.1:8080`:

```powershell
npm.cmd test
```

Ergebnis: **85 von 85 Tests bestanden**. Enthalten sind Firebase-Login, falsche Zugangsdaten, Passwort-Reset, Session-Wiederherstellung, Logout, Rollenclaims, Legacy-Profil-ID, fehlende Profile, Zielregeln, Trainingsbesitz, Spieler-/Trainer-/Adminabgrenzung, Mustertrainings, Übungen, unbekannte Collections, Produktionsschalter und Audit-Sicherheit.

Zusätzlich erfolgreich:

```powershell
node --check Backend/main.js
node --check Backend/productionAuthMode.js
node --check tests/firebase/productionAuthMode.test.js
npm.cmd run build
```

Der finale Vite-Produktions-Build und die vollständige Regression werden auf dem Release-Branch erneut ausgeführt. Der erzeugte Build wird bis zur abschließenden Freigabe nicht veröffentlicht.

Noch auszuführen: Browser-E2E des später ausdrücklich aktivierten endgültigen Release-Builds. Ein echter produktiver Login, Reset-Mail-Versand und produktiver Regeltest wurden absichtlich nicht durchgeführt. `git diff --check` meldet ausschließlich Zeilenende beziehungsweise nachgestellte Leerzeichen in bereits generierten Buildartefakten; die bearbeiteten Quelldateien enthalten keine gemeldeten Diff-Fehler.
