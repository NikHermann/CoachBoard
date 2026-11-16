# Firestore-Sicherheitsnotfallplan

Stand: 16. November 2026
Status: **Nur lokale Quellcodeanalyse und Vorbereitung. Keine produktive Änderung freigegeben oder durchgeführt.**

## 1. Kurzfassung und Sofortwarnung

Die veröffentlichten Regeln `allow read, write: if true` bedeuten nach der vorliegenden Aufgabenbeschreibung anonymen Vollzugriff auf alle Firestore-Dokumente. Der lokale Quellcode bestätigt, dass insbesondere `users` vertrauliche und personenbezogene Daten enthalten kann, einschließlich eines Legacy-Felds `password`. Solange solche Dokumente anonym lesbar sind, ist der Zustand **nicht sicher**.

Der aktuell aktive Frontend-Login ist keine Firebase-Auth-Sicherheitsgrenze:

- Beim Start lädt `Backend/main.js` die gesamten Collections `trainings` und `users`.
- Die Anmeldung sucht den Benutzernamen in der bereits geladenen Benutzerliste und vergleicht ein optionales `password`-Feld im Browser.
- Danach wird lediglich eine Firestore-Dokument-ID in `sessionStorage` gespeichert.
- `Backend/authService.js` enthält zwar Firebase-Auth-Funktionen, aber `login()` und `observeAuth()` werden vom aktiven Ablauf in `Backend/main.js` nicht verwendet.
- Rollenentscheidungen erfolgen im Frontend anhand des Firestore-Profilfelds `role`. Bei offenen Regeln kann ein Angreifer dieses Feld verändern; UI-Prüfungen schützen die Datenbank nicht.

Die kleinste belastbare Sofortbegrenzung auf Regelebene muss mindestens sämtliche anonymen Schreibzugriffe und sämtliche anonymen Reads auf `users` sperren. Das unterbricht jedoch den jetzigen Login. Wegen der gekoppelten Initialladung fällt ohne eine vorherige Frontend-Anpassung sogar die gesamte Dateninitialisierung aus.

## 2. Untersuchungsumfang und Grenzen

Untersucht wurden ausschließlich lokale Dateien. Es erfolgten:

- keine produktiven Firestore-Reads oder -Writes,
- keine Abfrage oder Änderung produktiver Firebase-Auth-Konten,
- keine Regelveröffentlichung,
- kein Deployment und kein Push,
- keine Ausgabe realer Passwortwerte,
- keine Änderung vorhandener Regel- oder Testdateien.

Der tatsächliche Inhalt, Umfang und Zustand der produktiven Collections sowie die Anzahl bestehender Firebase-Auth- und Legacy-Konten sind aus dem Repository allein nicht feststellbar. Aussagen hierzu müssen vor einer Umschaltung über autorisierte, read-only Inventarisierung und ein geprüftes Backup bestätigt werden.

Bereits vorhandene, nicht von dieser Untersuchung stammende Änderungen wurden nicht angefasst. Beim Beginn der Analyse waren Änderungen unter `node_modules` sichtbar.

## 3. Firestore-Bestandsaufnahme

### 3.1 Verwendete Collections

| Collection | Codebelege | Inhalt / mögliche Schutzklasse | Vor Login benötigt | Nach Login benötigt |
|---|---|---|---|---|
| `users` | `Backend/usersService.js:69-89, 125-131, 261, 299, 314` | UID, E-Mail, Benutzername, Verein, Rolle und möglicherweise Legacy-`password`; personenbezogen und hochkritisch | **Ja, im aktuellen Legacy-Login zwingend als vollständige Liste** | Profil, Rollenanzeige, Benutzerverwaltung |
| `trainings` | `Backend/trainingsService.js:99-172, 191, 247, 284, 308` | Trainingsinhalte, Notizen, Ersteller-ID/-name, eingebettete Übungen und Bild-/Dateiangaben; potenziell personenbeziehbar | Aktuell beim Seitenstart mitgeladen, sachlich für Auth nicht erforderlich | Bibliothek, eigene Trainings, Vorlagen, Erstellen/Bearbeiten/Löschen |
| `exercises` | `Backend/exercisesService.js:31-40, 74-76, 97-104, 191-197, 323` | Übungen, Beschreibungen, Coaching-Punkte und Bilder als Data-URL | Nicht für Login erforderlich | Übungsbibliothek, Trainingserstellung, KI-Vorbereitung, Bildpflege |

Weitere Firestore-Collections sind im ausführbaren Quellcode nicht nachweisbar. `Backend/exercisesService.js.js` ist offenbar eine zweite/alte Implementierung derselben `exercises`-Zugriffe; sie wird von `Backend/main.js` nicht importiert, erhöht aber die Wartungs- und Verwechslungsgefahr.

### 3.2 Leseoperationen

- `getDocs(collection(db, "users"))`: lädt **alle Benutzerprofile**, einschließlich eines vorhandenen Passwortfelds (`Backend/usersService.js:69-89`).
- `getDocs(collection(db, "trainings"))`: lädt alle Trainings (`Backend/trainingsService.js:139-172`).
- `getDocs(collection(db, "exercises"))`: lädt alle Übungen (`Backend/exercisesService.js:74-76`).
- Es gibt im aktiven Anwendungscode keine gezielten `getDoc`-Profilreads und keine serverseitig begrenzten Benutzerabfragen.
- `loadAll()` lädt `trainings` und `users` gemeinsam per `Promise.all` (`Backend/main.js:2461-2493`). Scheitert eine Collection, gilt die gesamte Initialladung als fehlgeschlagen.

### 3.3 Schreiboperationen

| Collection | Operationen | Betroffene Funktionen / Folgen einer Schreibsperre |
|---|---|---|
| `users` | `setDoc`, `updateDoc`, `deleteDoc` | Registrierung/Benutzeranlage, Profiländerung, Rollenänderung, Legacy-Migration und Löschen fallen aus (`Backend/usersService.js:91-325`). |
| `trainings` | `addDoc`, `updateDoc`, `deleteDoc` | Training erstellen, bearbeiten und löschen fällt aus (`Backend/trainingsService.js:175-319`). Lesen kann separat weiter funktionieren. |
| `exercises` | `addDoc`, `updateDoc`, `deleteDoc`, Feldlöschung | Übung anlegen/bearbeiten/löschen, Bild hochladen/löschen fällt aus (`Backend/exercisesService.js:31-40, 79-203, 323`). Das Entfernen einer Übung kann zusätzlich Trainingsänderungen auslösen. |

### 3.4 Folgen einer Lesesperre

- `users` gesperrt: aktueller Benutzername-/Passwort-Login, Session-Wiederherstellung, Profile und Benutzerverwaltung fallen aus. Durch `Promise.all` scheitert derzeit zusätzlich die gesamte Initialladung.
- `trainings` gesperrt: Bibliothek, eigene Trainings, Vorlagen, Detail-, Bearbeitungs- und Löschabläufe können nicht zuverlässig arbeiten. Durch `Promise.all` scheitert derzeit auch der Benutzer-Load.
- `exercises` gesperrt: Übungsansichten, Übungen in der Trainingserstellung und die lokale Vorbereitung des KI-Assistenten fallen aus. `exercises` ist nicht Teil des initialen `loadAll`, wird aber in späteren UI-Abläufen benötigt.

## 4. Authentifizierung und Berechtigungen

### 4.1 Zugriffe ohne Firebase Auth

Alle aktiven Firestore-Zugriffe aus `usersService.js`, `trainingsService.js` und `exercisesService.js` können im aktuellen UI ohne nachgewiesene Firebase-Auth-Sitzung erfolgen. Insbesondere:

- Die Initialladung startet unmittelbar beim Laden des Scripts (`Backend/main.js:3357-3359`).
- Der Login liest zuerst `users`, vergleicht lokal und ruft **nicht** `authService.login()` auf (`Backend/main.js:2609-2658`).
- Session-Wiederherstellung vertraut einer Dokument-ID in `sessionStorage`, nicht `request.auth` (`Backend/main.js:567-591`).
- Logout entfernt nur den lokalen UI-Zustand; `authService.logout()` wird nicht aufgerufen (`Backend/main.js:3324-3331`).
- Rollenprüfungen wie `canEditTraining()` und Admin-UI-Prüfungen sind clientseitig und daher keine Autorisierung (`Backend/main.js:1008-1021, 1826-1834`).

### 4.2 Bestehende Firebase-Auth-Konten

`createAuthAccount()` kann ein Firebase-Auth-Konto in einer sekundären App erzeugen (`Backend/authService.js:27-40`). Moderne Benutzerprofile werden dabei ohne Passwortfeld unter der Auth-UID angelegt (`Backend/usersService.js:122-144`). Der aktuelle Login meldet diese Konten jedoch nicht bei Firebase Auth an. Deshalb besitzen auch solche Benutzer im aktiven Ablauf nicht verlässlich eine Firestore-Regeln nutzbare Sitzung.

Der Code kann Auth-Konto und Firestore-Profil außerdem inkonsistent hinterlassen: Wird das Auth-Konto erfolgreich erstellt, aber das anschließende `setDoc` abgewiesen oder unterbrochen, bleibt ein verwaistes Auth-Konto zurück. Das Löschen eines Firestore-Profils löscht das Auth-Konto nicht.

### 4.3 Legacy-Konten ohne Firebase Auth

Legacy-Profile können ein Klartext- oder anderweitig direkt vergleichbares `password`-Feld enthalten (`Backend/usersService.js:69-80`; `Backend/main.js:2639-2648`). Diese Konten funktionieren nur, solange die Anwendung die `users`-Collection anonym lesen kann. Das ist mit dem Schutz der Passwortdaten unvereinbar.

Eine lokale Migrationsfunktion existiert (`Backend/usersService.js:275-304`), sie ist aber nicht als sicherer administrativer, transaktionaler Prozess implementiert. Sie darf ohne Inventarisierung, Backup, Identitätsprüfung, Kollisionsprüfung und ausdrückliche Freigabe nicht produktiv verwendet werden.

### 4.4 Weitere Funktions- und Sicherheitsbefunde

- Die öffentliche Registrierung legt laut UI einen Trainer an (`Backend/main.js:2661-2699`). Bei offenen Regeln und aktivierter Auth-E-Mail/Passwort-Methode ermöglicht dies unberechtigte Registrierung. Der Aufruf übergibt derzeit allerdings keine E-Mail, während `createUser()` eine E-Mail verlangt; der Ablauf ist dadurch wahrscheinlich bereits funktional inkonsistent.
- Die Profil-Passwortänderung übergibt `password` an `updateUserProfile()` (`Backend/main.js:2727-2769`), doch `updateUserProfile()` übernimmt dieses Feld nicht in sein Update-Payload (`Backend/usersService.js:214-272`). Der Legacy-Passwortwechsel ist damit im untersuchten Code nicht wirksam.
- Admin-Benutzerverwaltung versucht ebenfalls, neue Passwörter über diesen nicht wirksamen Pfad zu setzen (`Backend/main.js:2925-2955`).
- Die vorhandenen lokalen Zielregeln verwenden Custom Claims (`request.auth.token.role`), aber der Repository-Code setzt solche Claims nicht. Clientseitig gespeicherte Firestore-Rollen erzeugen keine Custom Claims.
- Die vorhandene Regel für Admin-Benutzeranlage ist mit dem Clientablauf nicht kompatibel: Der Admin erstellt ein anderes Auth-Konto, versucht danach aber als eigener Benutzer ein Profil unter der neuen UID anzulegen. Eine Regel `request.auth.uid == userId` würde dies zu Recht ablehnen. Benutzerbereitstellung und Rollenvergabe gehören in eine privilegierte, serverseitig autorisierte Funktion.

## 5. Explizite Risikobewertung

| Risiko | Vertraulichkeit | Integrität | Verfügbarkeit | Bewertung |
|---|---|---|---|---|
| Anonymer Read auf `users` und Passwortdaten | **Kritisch**: mögliche Offenlegung aller Profile und direkt nutzbarer Geheimnisse | Mittelbar kritisch durch Kontoübernahme und Passwortwiederverwendung | Kurzfristig hoch, aber unvertretbar erkauft | Muss beendet werden; niemals als sicher bezeichnen. |
| Anonymer Write auf alle Collections | Hoch | **Kritisch**: Löschen, Überschreiben, Schad-/Fehldaten | **Kritisch**: vollständige Sabotage möglich | Sofortige Schreibsperre ist höchste Priorität. |
| Anonymer Zugriff auf Trainings/Übungen | Je nach Inhalt mittel bis hoch; Erstellerdaten und interne Inhalte können betroffen sein | **Kritisch** bei Write; Manipulation und Löschung möglich | Kritisch bei Missbrauch | Temporärer anonymer Read wäre nur Schadensbegrenzung, kein sicherer Zustand. |
| Rollen-/Berechtigungsmanipulation | Hoch | **Kritisch** | Hoch | Firestore-Profilrolle und UI-Prüfungen dürfen keine Autorisierungsquelle sein. |
| Unberechtigte Registrierung | Hoch | Hoch: selbstgewählte Traineridentität bzw. Orphan-Accounts | Mittel | Öffentliche Registrierung bis zum sicheren serverseitigen Einladungsprozess deaktivieren. |
| Bestehende Firebase-Auth-Konten | Auth schützt nur, wenn der aktive Client wirklich anmeldet | Profil/Claims müssen konsistent sein | Umschaltung kann funktionieren, Bestand ist aber unbekannt | Read-only Inventur und Testfälle erforderlich. |
| Legacy-Konten ohne Firebase Auth | **Kritisch**, solange Passwortfelder lesbar sind | Hoch | Sperre der `users`-Reads beendet Legacy-Login | Kontrollierte Umstellung/Reset erforderlich; keine stille Kontomigration. |

## 6. Bewertung möglicher Übergangsmaßnahmen

| Maßnahme | Vertraulichkeit | Integrität | Verfügbarkeit | Ergebnis |
|---|---|---|---|---|
| Nur Writes sperren, alle Reads offen lassen | Passwort-/Profildaten bleiben öffentlich: **inakzeptabel** | Große sofortige Verbesserung | Bestehender Login bleibt verfügbar | Nicht ausreichend und nicht sicher. |
| `users` komplett sperren, Trainings/Übungen anonym read-only | Passwort-/Profildaten geschützt; Trainings bleiben öffentlich | Writes geschützt | Aktueller Login und wegen `loadAll` zunächst die App fallen aus | Sinnvolle Variante A **nur zusammen mit vorher getesteter Frontend-Entkopplung**; weiterhin kein sicherer Zielzustand. |
| Alle Firestore-Zugriffe sperren | Beste Vertraulichkeits- und Integritätsbegrenzung | Beste Begrenzung | Anwendung vollständig nicht verfügbar | Vorbereiteter Not-Aus bei bestätigter aktiver Ausnutzung oder unkontrollierbarer Lage. |
| Nur authentifizierte Reads/Writes mit Firestore-Profilrollen | Besser, aber Rollen können bei falschen Regeln manipulierbar sein | Nicht ausreichend | Legacy-Konten fallen aus | Kein Zielzustand ohne serverseitig verifizierte Rollen. |
| Firebase Auth + serverseitig gesetzte Claims + geschützte Profile | Hoch | Hoch | Nach vorbereiteter Migration hoch | Sicherer Zielzustand; Claims-Lebenszyklus und Provisionierung erforderlich. |

## 7. Im Emulator vorzubereitende Regelvarianten

**Noch nicht implementiert oder getestet, da vor lokalen Teständerungen Zustimmung verlangt wurde.** Ausschließlich `demo-coachboard-auth` verwenden. `firebase.emulator.json` und `tests/firebase/emulatorSafety.js` enthalten bereits localhost-/`demo-`-Schutz. Die produktive `.firebaserc` verweist dagegen auf `coachboarddb`; deshalb dürfen Tests ausschließlich über den vorhandenen fail-closed Runner `tests/firebase/runEmulators.cjs` gestartet werden.

### 7.1 Variante A – kurzfristige Schadensbegrenzung

Vorgesehene Semantik:

```text
users:      read=false, write=false
trainings:  read=true (nur befristete Verfügbarkeitsausnahme), write=false
exercises:  read=true (nur befristete Verfügbarkeitsausnahme), write=false
alles sonstige: read=false, write=false
```

Warum `users` vollständig gesperrt werden muss: Firestore Security Rules können bei einem Dokument-Read keine einzelnen Felder ausblenden. Ein erlaubter Read liefert auch ein vorhandenes `password`-Feld. Eine Regel, die nur Dokumente ohne Passwort lesbar macht, löst den Legacy-Login nicht und kann Collection-Queries an Legacy-Dokumenten scheitern lassen; außerdem blieben personenbezogene Daten anonym sichtbar.

Auswirkungen:

- Aktueller Login und Registrierung fallen aus.
- Benutzerprofile und Benutzerverwaltung fallen aus.
- Alle Schreibfunktionen fallen aus.
- Trainings- und Übungsreads könnten auf Regelebene verfügbar bleiben, aber die aktuelle App kann sie wegen `Promise.all(trainings, users)` nicht anzeigen. Vor einer solchen Umschaltung wäre eine kleine Frontend-Änderung nötig: öffentliche/read-only Inhalte getrennt laden, keinen `users`-Read vor Auth ausführen und einen klaren Wartungs-/Loginhinweis zeigen.
- Trainings/Übungen bleiben anonym lesbar. Variante A ist deshalb ausdrücklich **Schadensbegrenzung, nicht sicherer Zustand**.

Wenn Trainings oder Übungen vertrauliche/personenbezogene Inhalte enthalten oder aktive Manipulation vermutet wird, muss Variante A strenger sein und auch deren Reads sperren.

Erforderliche lokale Tests:

- anonym: alle `users`-Gets/Lists und alle Writes abgewiesen;
- anonym: ausschließlich `trainings`/`exercises` Reads erlaubt;
- anonym und authentifiziert: keinerlei Writes möglich;
- unbekannte Collections immer abgewiesen;
- Dokumente mit Passwortfeldern unter keiner Identität lesbar;
- Regressionstest, der ausdrücklich beweist, dass kein Query Passwortdaten ausliefert.

### 7.2 Variante B – sicherer Zielzustand

Vorgesehene Semantik:

- Standardmäßig alles verweigern.
- Firestore ausschließlich mit gültigem `request.auth`.
- Rollen ausschließlich aus serverseitig gesetzten und überprüften Custom Claims oder einem gleichwertig privilegiert verwalteten Autorisierungsdienst verwenden.
- Benutzer dürfen nur ihr eigenes, passwortfreies Profil lesen und nur eine enge Allowlist ungefährlicher Felder ändern.
- Admins dürfen Profile auflisten; Rollen- und Kontoverwaltung erfolgt nicht über direkten Client-Write, sondern über autorisierte Cloud Functions/Admin SDK.
- In keinem Profil darf ein `password`-Feld erstellt oder aktualisiert werden. Bestehende Legacy-Passwortdokumente werden bis zur kontrollierten Bereinigung auch für normale Benutzer nicht freigegeben.
- Trainings dürfen authentifizierte Benutzer entsprechend Produktentscheidung lesen. Create setzt eine serverseitig prüfbare, unveränderliche Eigentümer-UID. Update/Delete nur Eigentümer bzw. Admin.
- Übungen dürfen authentifizierte Benutzer lesen; Writes nur Trainer/Admin nach verifiziertem Claim.

Erhalt von IDs und Referenzen:

- Bestehende Firestore-Dokument-IDs bleiben unverändert.
- Bestehende `created_by_user_id`, `exerciseIDs` und andere Referenzen werden nicht überschrieben.
- Für Legacy-Eigentümer wird nach Freigabe ein zusätzliches, unveränderliches Feld wie `owner_auth_uid` oder eine serverseitig geschützte Zuordnung eingeführt. Regeln autorisieren anhand der Auth-UID, während alte Referenzen für Kompatibilität erhalten bleiben.
- Die konkrete Zuordnung muss vor jeder Datenänderung inventarisiert, gesichert, auf Eindeutigkeit geprüft und im Emulator mit synthetischen Daten getestet werden.

Erforderliche Tests zusätzlich zu Variante A:

- nicht authentifiziert: sämtliche Reads/Writes abgewiesen;
- Spieler: eigenes passwortfreies Profil lesen, fremde Profile nicht lesen/listen, Rolle/UID nicht ändern;
- Trainer: erlaubte Trainings/Übungen bearbeiten, aber keine Rollen oder Benutzer verwalten;
- Admin: vorgesehene Administration über serverseitigen Endpunkt, nicht durch gefälschte Profildaten;
- gefälschtes Firestore-`role`-Feld erteilt keine Rechte;
- fehlende, abgelaufene oder geänderte Claims verhalten sich fail-closed;
- Legacy-Dokument-ID mit neuer Auth-UID funktioniert über die geschützte Zuordnung;
- Trainingseigentum, Vorlagen, Übungsreferenzen und Löschfolgen werden getestet;
- kein Create/Update kann ein `password`-Feld einführen;
- Queries entsprechen den Regeln und lecken keine fremden Profile.

## 8. Notfall- und Umschaltplan

### Phase 0 – Change Freeze und Verantwortlichkeiten

1. Produktive Firestore-/Auth-Schreiboperationen organisatorisch einfrieren.
2. Incident Owner, Firebase-Projektverantwortliche, Datenschutzkontakt und Freigabeperson benennen.
3. Aktuellen Regelstand, Hosting-Version, Functions-Version und Konfiguration revisionssicher erfassen; keine Secrets oder Passwortwerte in Tickets/Logs kopieren.
4. Prüfen, ob aktiver Missbrauch vorliegt. Bei bestätigter Exfiltration oder Manipulation Datenschutz-/Incident-Prozess auslösen.

### Phase 1 – Sicherung und read-only Inventar

1. Mit einem autorisierten Betreiber einen konsistenten Firestore-Export in einen getrennten, zugriffsgeschützten Bucket erstellen. Dies ist eine produktive Operation und benötigt eine gesonderte Freigabe.
2. Firebase-Auth-Benutzerbestand separat und zugriffsgeschützt inventarisieren; keine Passwortdaten exportieren (Firebase Auth stellt diese nicht als Klartext bereit).
3. Hashes/Manifest, Zeitstempel, Projekt-ID, Datenbank-ID, Exportpfad und Berechtigungen dokumentieren.
4. Wiederherstellbarkeit in einem **separaten Nichtproduktionsprojekt** mit repräsentativen Stichproben prüfen: Dokumentanzahl, IDs, Referenzen und Feldtypen vergleichen.
5. Produktive Daten nur über Least-Privilege-Read-only-Rolle kontrollieren. Keine Client-SDK-Abfrage mit den offenen Regeln als Inventurwerkzeug verwenden. Aggregierte Ergebnisse dokumentieren, nie Passwortwerte.
6. Feststellen: Anzahl `users`, Anzahl Profile mit vorhandenem Passwortfeld (nur Zählung), Auth-UID-Matches, verwaiste Auth-Konten, verwaiste Profile, doppelte E-Mails/Benutzernamen, Legacy-Dokument-IDs und Eigentümerreferenzen.

### Phase 2 – Lokale Vorbereitung

1. Variante A und B in getrennten lokalen Regeldateien anlegen; produktiv referenzierte Konfiguration nicht ändern.
2. Synthetische Fixtures verwenden. Keine produktiven Exporte in den Emulator laden, sofern sie Passwortfelder enthalten.
3. Test-Runner muss `--project demo-coachboard-auth`, localhost-Emulatorhosts und externen Netzwerkschutz erzwingen.
4. Frontend umbauen: vor Auth kein `users`-Listen; `onAuthStateChanged` als Sitzungsquelle; Login über Firebase Auth; eigenes Profil gezielt per UID/geschützter Zuordnung lesen; `loadAll` entkoppeln.
5. Selbstregistrierung deaktivieren oder in einen serverseitig autorisierten Einladungs-/Provisionierungsprozess überführen.
6. Rollenvergabe, Benutzeranlage/-sperre und Claims ausschließlich serverseitig implementieren; Audit-Logging ohne Geheimnisse.

### Phase 3 – Abnahmetests

Bestehende Benutzer:

- modernes Auth-Konto mit passendem Profil;
- Auth-Konto ohne Profil;
- Profil ohne Auth-Konto;
- Legacy-Profil mit/ohne Passwortfeld;
- Legacy-Dokument-ID ungleich Auth-UID;
- doppelte E-Mail bzw. Benutzername;
- deaktiviertes Konto, falsches Passwort, Reset, E-Mail-Verifikation nach Produktentscheidung;
- Spieler, Trainer, Admin und fehlender/ungültiger Claim.

Trainingsfunktionen:

- Liste/Details/Filter;
- eigene vs. fremde Trainings;
- Erstellen, Bearbeiten, Löschen;
- Vorlagenrechte;
- eingebettete Übungen und `exerciseIDs`;
- Übung anlegen/bearbeiten/löschen;
- Bildfelder und Größenlimits;
- Entfernung einer Übung aus Trainings;
- KI-Ablauf nur mit erlaubten, bereits autorisiert gelesenen Übungen;
- Verhalten bei `permission-denied`, Netzfehlern und abgelaufenen Tokens.

### Phase 4 – Veröffentlichungsreihenfolge

Eine Umschaltung darf nur in einem abgestimmten Wartungsfenster erfolgen. Empfohlene Reihenfolge:

1. Backup und Restore-Test erfolgreich; Inventar und Kontozuordnung freigegeben.
2. Serverseitige Provisionierung/Claims und Monitoring bereitstellen, zunächst ohne den alten Client zu brechen.
3. Kompatibles Frontend veröffentlichen, das Firebase Auth nutzt, keine anonymen Benutzerreads ausführt und Berechtigungsfehler sauber behandelt. Es muss bereits mit den kommenden Regeln getestet sein.
4. Kontrollierte Benutzerumstellung/Passwort-Reset nach gesonderter Freigabe; keine Passwörter aus Firestore kopieren.
5. Enges Beobachtungsfenster; erst danach Variante B veröffentlichen.
6. Verifizieren, dass anonyme Reads/Writes und Rollenmanipulation tatsächlich abgewiesen werden.
7. Legacy-Passwortfelder erst nach Backup, erfolgreicher Kontoumstellung und separater Freigabe kontrolliert entfernen.

Wenn die Exposition sofort beendet werden muss und das kompatible Frontend noch nicht bereitsteht, Variante A oder der vollständige Not-Aus hat Vorrang vor Verfügbarkeit. Diese Entscheidung muss der Incident Owner ausdrücklich treffen.

### Freigabekriterien

- Backup nachweislich wiederherstellbar.
- 100 % der relevanten Konten klassifiziert; keine ungeklärten Admin-Zuordnungen.
- Alle Emulator-Sicherheits- und Negativtests grün.
- Kein Clientpfad liest/listet `users` vor Auth.
- Keine Passwortfelder werden vom neuen Client gelesen oder geschrieben.
- Claims werden nur serverseitig gesetzt; Rollenänderung ist auditiert.
- Staging-/Demo-End-to-End-Test aller Rollen und Trainingsfunktionen erfolgreich.
- Monitoring, Supportablauf und sicherer Rückweg sind einsatzbereit.

### Abbruchkriterien

- Backup/Restore nicht nachgewiesen;
- ungeklärte Identitäts- oder Rollenmapping-Konflikte;
- unerwartete anonyme Zugriffe im Test;
- Legacy-Passwortdaten in Responses oder Logs;
- kritische Trainingsreferenzen brechen;
- Admin-/Trainerrechte stimmen nicht mit der Freigabeliste überein;
- Fehlerquote oder ausgesperrte berechtigte Nutzer überschreitet den vorab festgelegten Grenzwert.

### Monitoring

- Firestore `PERMISSION_DENIED` nach Collection, Operation und App-Version aggregieren; keine Dokumentinhalte loggen.
- Auth-Erfolgs-/Fehlerraten, Reset-Flows, deaktivierte Konten und Claim-Aktualisierung überwachen.
- Ungewöhnliche Write-/Delete-Raten und Adminaktionen alarmieren.
- Client-Version und Regelversion korrelieren.
- Supportkanal für ausgesperrte Legacy-Nutzer vorbereiten; Identität außerhalb des alten Passwortfelds prüfen.

### Sicherer Rückweg

Ein Rollback darf **niemals** wieder `allow read, write: if true` oder anonyme `users`-Reads aktivieren.

1. Frontend auf eine vorher geprüfte, Firebase-Auth-kompatible Version zurückschalten, die mit den restriktiven Regeln funktioniert.
2. Bei funktionalen Problemen Writes geschlossen halten und auf read-only Betrieb für bereits authentifizierte Benutzer wechseln.
3. Falls Auth/Claims fehlerhaft sind, kontrollierte Wartungsseite aktivieren; keine Legacy-Passwortprüfung reaktivieren.
4. Bei Datenkorruption Writes sperren, Umfang bestimmen und nur aus dem verifizierten Backup in einem genehmigten Restore-Verfahren wiederherstellen.
5. Vollständiger Not-Aus: Default-deny-Regeln plus Wartungsseite. Wiederöffnung erst nach erneuter Sicherheitsfreigabe.

## 9. Priorisierte Maßnahmenliste

### Sofort erforderlich

1. Incident- und Change-Freeze ausrufen; Verantwortliche und Freigabeweg festlegen.
2. Öffentliches `users`-Lesen und sämtliche anonymen Writes als kritische Exposition behandeln.
3. Backup plus Restore-Test autorisieren und durchführen.
4. Read-only Bestandsklassifikation ohne Ausgabe von Passwortwerten durchführen.
5. Entscheidung vorbereiten: Variante A mit eingeschränktem read-only Angebot oder vollständiger Not-Aus, falls Missbrauch/Vertraulichkeit es erfordert.

### Vor der Auth-Umstellung

1. Auth-/Profil-/Legacy-Bestand eindeutig zuordnen.
2. Frontend auf echte Firebase-Auth-Sitzung und gezielte Profilreads umbauen.
3. `loadAll` entkoppeln und sämtliche anonymen `users`-Queries entfernen.
4. Öffentliche Trainerregistrierung deaktivieren.
5. Serverseitige Provisionierung, Claims und Auditierung implementieren.
6. Sicheren Reset-/Einladungsablauf für Legacy-Benutzer vorbereiten.

### Vor Regelveröffentlichung

1. Beide Varianten im Demo-Emulator implementieren und vollständig negativ testen.
2. Staging-/Demo-End-to-End-Test mit allen Kontoklassen und Rollen.
3. Regel- und Frontendkompatibilität sowie Query-Verhalten prüfen.
4. Monitoring, Wartungsseite, Support und sicheren Rückweg testen.
5. Formale Security-/Incident-Freigabe einholen.

### Nach der Umstellung

1. Anonyme Reads/Writes aktiv verifizieren und Zugriffsfehler überwachen.
2. Konten- und Funktionsstichproben durchführen.
3. Legacy-Passwortfelder nach separater Freigabe sicher entfernen; Werte niemals exportieren oder protokollieren.
4. Verwaiste Profile/Auth-Konten kontrolliert bereinigen, nicht automatisch löschen.
5. Claims, Adminaktionen und Regeln regelmäßig prüfen; Incident-Nachbereitung dokumentieren.

## 10. Kleinster sicher ausführbarer nächster lokaler Schritt

Nach ausdrücklicher Zustimmung lokal, ohne Produktionskontakt:

1. Zwei neue Regeldateien erstellen, z. B. `firestore.mitigation.rules` (Variante A) und `firestore.target.rules` (Variante B).
2. Separate Testdateien je Variante ergänzen und den Runner so parametrisieren, dass ausschließlich `demo-coachboard-auth` und localhost verwendet werden.
3. Keine reale Benutzer- oder Trainingsdaten verwenden; ausschließlich synthetische Fixtures.
4. Zuerst Variante A testen: Passwort-/Benutzerreads und alle Writes fail-closed; befristete Trainings-/Übungsreads explizit belegen.
5. Danach Variante B testen: Auth, Claims, Eigentum, Profilfeld-Allowlist und Legacy-ID-Zuordnung.
6. Testergebnisse und erwartete Anwendungsausfälle in diesem Bericht ergänzen.

**Stopp:** Diese lokalen Regel- und Teständerungen wurden noch nicht vorgenommen. Es liegt keine Freigabe für produktive Regeländerungen, Kontenmigration, Datenänderungen, Deployment oder Push vor.

## 11. Lokale Umsetzung und Prüfergebnis

Umgesetzt und geprüft am 16. November 2026. Alle Läufe verwendeten ausschließlich `demo-coachboard-auth`, Auth Emulator `127.0.0.1:9099` und Firestore Emulator `127.0.0.1:8080`. Der Firebase CLI bestätigte ausdrücklich, dass bei der Demo-Projektkennung Zugriffe auf nicht emulierte Dienste fehlschlagen. Es fand kein Deployment, Push, Commit, produktiver Read/Write oder Konten-/Datenmigration statt.

### 11.1 Sicherungs- und Ausgangslage

- Branch: `fix/login-routing-2026-11-15`
- Ausgangscommit: `b575a6577491db2ca40a1818720a6e77f6d3d42d`
- Derselbe Commit ist als `origin/fix/login-routing-2026-11-15` vorhanden.
- Vorhandene lokale Sicherungspunkte: `backup-before-firebase-emulator-phase1-2026-11-15` und `backup-before-login-routing-fix-2026-11-15`.
- Sämtliche vorgefundenen Emulator-Dateien waren committed.
- Bereits vorhandene Änderungen unter `node_modules` wurden weder verändert noch zurückgesetzt.
- Es wurde kein zusätzlicher Commit, Stash oder Tag erzeugt, damit fremde Arbeitsänderungen nicht versehentlich erfasst und keine automatische Git-Historienänderung vorgenommen wird.

### 11.2 Neu erstellte Dateien

- `firestore.mitigation.rules`: Variante A, `users` vollständig gesperrt, `trainings` und `exercises` öffentlich read-only, unbekannte Collections gesperrt.
- `firestore.target.rules`: Variante B mit Firebase Auth, Custom Claims, geschützten Profilen, Auth-UID-Eigentum und Default-Deny.
- `tests/firebase/firestoreMitigationRules.test.js`: acht Tests für Variante A.
- `tests/firebase/firestoreTargetRules.test.js`: achtzehn Tests für Variante B.
- `tests/firebase/runRuleVariants.cjs`: fail-closed Runner mit fest codiertem Demo-Projekt und getrennten Emulatorläufen.

### 11.3 Geänderte bestehende Dateien

- `tests/firebase/testFirebase.js`: Der Test-Harness akzeptiert nur eine feste Allowlist aus `firestore.test.rules`, `firestore.mitigation.rules` und `firestore.target.rules`. Der bisherige Standard bleibt unverändert.
- `package.json`: neues lokales Script `test:firebase:rule-variants`.
- `FIRESTORE_SECURITY_NOTFALLPLAN.md`: diese Ergebnisdokumentation.

Unverändert blieben ausdrücklich `Backend/main.js`, `Backend/firebase.js`, `.firebaserc`, `firebase.json`, `firebase.emulator.json` und `firestore.test.rules`.

### 11.4 Vergleich der Varianten

| Bereich | Variante A – Schadensbegrenzung | Variante B – Zielzustand |
|---|---|---|
| Anonym | Trainings/Übungen lesbar; alles andere gesperrt | Sämtliche Zugriffe gesperrt |
| `users` Read | Für alle Identitäten gesperrt | Nur gezieltes `get` eines passwortfreien, per `uid` zugeordneten eigenen Profils oder durch Admin-Claim; `list` vollständig gesperrt |
| `users` Write | Vollständig gesperrt | Eigenes neues Spielerprofil ohne Passwort erlaubt; eigene Updates nur `username`/`club`; Rollen-, E-Mail-, UID-, Passwort- und Löschänderungen gesperrt |
| Passwortfelder | Nicht lesbar, weil `users` vollständig gesperrt | Dokumente mit Passwortfeld auch für Eigentümer/Admin nicht lesbar; Create/Update mit Passwortfeld gesperrt |
| Trainings Read | Öffentlich | Nur authentifiziert |
| Trainings Write | Vollständig gesperrt | Create nur mit eigener `created_by_auth_uid`; Update/Delete nur Eigentümer oder Admin-Claim; Eigentümerfeld unveränderlich |
| Legacy-Training ohne Auth-UID | Read öffentlich, Write gesperrt | Authentifiziert lesbar; normale Benutzer können nicht schreiben; Admin-Claim kann verwalten |
| Übungen Read | Öffentlich | Nur authentifiziert |
| Übungen Write | Vollständig gesperrt | Nur Trainer-/Admin-Custom-Claim |
| Rollenquelle | Keine Rolle gewährt Schreibrechte | Ausschließlich `request.auth.token.role`, niemals Firestore-Profilrolle |
| Unbekannte Collections | Vollständig gesperrt | Vollständig gesperrt |
| Sicherheitsstatus | **Nicht vollständig sicher**, da Trainings und Übungen öffentlich bleiben | Restriktiver Zielentwurf; produktiv erst nach Backend-/Frontend-Voraussetzungen und Security Review |

### 11.5 Testergebnisse

Ausgeführt:

```text
npm.cmd run test:firebase:rule-variants
npm.cmd test
```

Ergebnis:

- Variante A: **8/8 bestanden**.
- Variante B: **18/18 bestanden**.
- Gesamte Regression einschließlich bestehender Tests und neuer Variantentests: **43/43 bestanden**.
- JavaScript-Syntaxprüfung für Runner, Harness und beide neuen Testdateien: bestanden.
- Firestore-Regelsyntax: durch Laden und Ausführen beider Regelwerke im Emulator bestätigt.
- Finale fehlgeschlagene Tests: **0**.

Während der Entwicklung schlugen zunächst zwei Variante-B-Tests fehl. Diese Befunde wurden nicht ignoriert:

1. Ein Admin-Collection-Query konnte nicht zuverlässig als Feldfilter für Legacy-Passwortdokumente dienen. Konsequenz: `users`-`list` ist in Variante B jetzt vollständig gesperrt; Admin-Auflistung benötigt eine autorisierte Backend-Funktion.
2. Ein unvollständiges Legacy-Profil war allein über eine passende Dokument-ID lesbar. Konsequenz: Eigentum verlangt jetzt ein vorhandenes `uid`-Feld mit exakter Übereinstimmung zu `request.auth.uid`.

Ein früher Startversuch scheiterte vor Testbeginn an der lokalen PowerShell-Richtlinie für `npm.ps1`; `npm.cmd` wurde ohne Richtlinienänderung verwendet. Ein weiterer Startversuch scheiterte vor Testbeginn an einem nicht quotierten Windows-Pfad im neuen Runner; der Runner verwendet nun den über `PATH` aufgelösten `node`-Befehl. Beide Probleme hatten keinen produktiven Firebase-Kontakt.

Die bei Negativtests ausgegebenen `PERMISSION_DENIED`-Meldungen sind erwartete erfolgreiche Ablehnungen.

### 11.6 Fehlende Backend- und Frontend-Voraussetzungen

- Der aktive Client muss Firebase Auth tatsächlich verwenden und `onAuthStateChanged` zur Sitzungsquelle machen.
- Vor Auth darf kein `users`-Collection-Read erfolgen; `loadAll()` muss entkoppelt werden.
- Custom Claims müssen ausschließlich serverseitig gesetzt, geändert und entzogen werden. Der aktuelle Repository-Code enthält dafür noch keine sichere Admin-Funktion.
- Admin-Benutzerauflistung, Provisionierung, Rollenänderung, Sperre und Löschung benötigen eine autorisierte Backend-Funktion/Admin SDK. Direkte Client-Writes bleiben absichtlich gesperrt.
- Bestehende Legacy-Profile benötigen nach Freigabe eine verifizierte Auth-UID-Zuordnung im `uid`-Feld. Dokument-IDs und Referenzen können dabei bestehen bleiben.
- Bestehende Trainings benötigen für Eigentümeränderungen ein verifiziertes `created_by_auth_uid`. Alte `created_by_user_id`-Referenzen bleiben erhalten; ohne neues Feld sind normale Legacy-Trainingswrites absichtlich gesperrt.
- Legacy-Passwortfelder müssen nach Backup, Identitätsumstellung und gesonderter Freigabe kontrolliert entfernt werden. Bis dahin bleiben diese Dokumente in Variante B auch für Admin-Clientreads gesperrt.
- Öffentliche Registrierung muss deaktiviert oder serverseitig als Einladungs-/Provisionierungsablauf abgesichert werden.

### 11.7 Auswirkungen auf die bisherige Anwendung

- Variante A beendet den bisherigen Firestore-basierten Login vollständig. Da `loadAll()` `users` und `trainings` gemeinsam lädt, kann die aktuelle App ohne Frontend-Anpassung auch die weiterhin erlaubten Trainingsreads nicht sinnvoll nutzen. Sämtliche Schreibfunktionen fallen aus.
- Variante B ist mit dem heutigen aktiven Login ebenfalls nicht kompatibel, weil dieser keine Firebase-Auth-Sitzung aufbaut.
- Benutzerverwaltung und Benutzerlisten funktionieren unter Variante B absichtlich nicht direkt aus dem Client.
- Aktuelle Trainingscreates senden `created_by_user_id`, nicht `created_by_auth_uid`, und werden deshalb abgewiesen.
- Bestehende Legacy-Trainings sind für normale Benutzer read-only, bis die geprüfte Eigentümerzuordnung vorbereitet ist.
- Übungen sind erst nach echter Auth-Sitzung lesbar; Writes benötigen korrekte serverseitige Claims.

### 11.8 Verbleibende Risiken

- Variante A lässt Trainings und Übungen öffentlich lesbar und darf niemals als vollständig sicher bezeichnet werden.
- Emulatorerfolg beweist Regelverhalten mit synthetischen Daten, ersetzt aber keine produktive Bestandsinventur, Backup-/Restore-Prüfung oder Security Review.
- Regeln müssen Custom Claims vertrauen; kompromittierte serverseitige Claim-Vergabe würde die Autorisierung kompromittieren.
- Admins können in Variante B Legacy-Trainings verwalten. Vor produktiver Nutzung ist zu entscheiden, ob zusätzliche Feld-Allowlist, Auditierung oder serverseitige Administration erforderlich ist.
- Übungswrites sind derzeit collectionweit für Trainer/Admin erlaubt. Falls Übungen Eigentümer- oder Teamgrenzen benötigen, muss das Datenmodell vor Freigabe erweitert werden.
- Authentifizierte Benutzer dürfen alle Trainings lesen. Falls Trainings mandanten-, team- oder altersgruppenbezogen vertraulich sind, sind zusätzliche Claims bzw. ACLs erforderlich.

### 11.9 Rückgängig-Anleitung für ausschließlich diese lokalen Änderungen

Keinesfalls die bestehenden `node_modules`-Änderungen zurücksetzen. Vor dem Rückgängigmachen erneut `git status --short` prüfen.

Zu entfernen sind ausschließlich die neu erstellten Dateien:

```text
firestore.mitigation.rules
firestore.target.rules
tests/firebase/firestoreMitigationRules.test.js
tests/firebase/firestoreTargetRules.test.js
tests/firebase/runRuleVariants.cjs
```

In `tests/firebase/testFirebase.js` nur die Allowlist und den optionalen `ruleFile`-Parameter zurücknehmen. In `package.json` nur `test:firebase:rule-variants` entfernen. In diesem Bericht nur Abschnitt 11 entfernen. Keine pauschalen Restore-, Reset- oder Clean-Befehle verwenden, weil der Arbeitsbaum fremde Änderungen enthält.

**Produktionsstopp bleibt bestehen:** Keines der beiden Regelwerke ist veröffentlicht. Es besteht weiterhin keine Freigabe für Deployment, Kontenmigration, Datenänderung, Commit oder Push.
