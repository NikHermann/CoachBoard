# Vorbereitung der produktiven Firebase-Bestandsprüfung

Stand: 16. November 2026. Der produktive Audit wurde **nicht ausgeführt**. Es gab keinen Zugriff auf `coachboarddb`.

## Zweck und Sicherheitsgrenze

Der vorbereitete Audit ermittelt ausschließlich anonymisierte Summen zu Firebase Authentication, den Firestore-Collections `users` und `trainings` sowie deren Zuordnungen. Er verändert weder Auth-Konten noch Claims, Profile, Trainings oder Regeln. Die Ausführung ist bis zu einer gesonderten ausdrücklichen Freigabe gesperrt.

Der Audit darf nicht zur automatischen Bereinigung oder Migration verwendet werden. Mehrdeutige Fälle werden nur gezählt. Namen, E-Mail-Adressen, UIDs, Dokument-IDs, Passwortwerte und Einzeldatensätze erscheinen nicht in der Ausgabe.

## Dateien

- `functions/audit/readOnlyAudit.cjs`: reine Aggregationslogik und lesender Datenabruf.
- `functions/audit/productionReadOnlyAudit.cjs`: bewusst separat gehaltener Produktions-Runner mit fester Projektkennung und doppelter Bestätigung.
- `tests/firebase/productionReadOnlyAudit.test.js`: Tests mit ausschließlich synthetischen Emulator-Daten und statische Prüfung auf Firebase-Schreibmethoden.

Bestehende Anwendungs-, Regel- und Firebase-Konfigurationsdateien werden durch diese Vorbereitung nicht geändert. Die vorhandene Abhängigkeit `firebase-admin` aus `functions/package.json` wird wiederverwendet; es wurde keine Abhängigkeit installiert.

## Benötigte Berechtigungen

Für den ausführenden, zeitlich begrenzt berechtigten Principal sind folgende vordefinierte Nur-Lese-Rollen vorgesehen:

- `roles/firebaseauth.viewer` für das Auflisten der Auth-Konten und das Lesen von Status und Custom Claims.
- `roles/datastore.viewer` für maskierte Dokumentabfragen und die Passwortfeld-Aggregation in Firestore.

Beide Rollen enthalten keine Konto-, Claim- oder Firestore-Schreibberechtigungen. Noch enger wäre eine vorab geprüfte Custom Role mit den tatsächlich benötigten Lese-Permissions. Die Berechtigungen sollen nur auf `coachboarddb`, nach Möglichkeit zeitlich befristet und über einen dedizierten beziehungsweise impersonierten Principal vergeben werden. Ein Service-Account-Schlüssel ist nicht erforderlich und darf insbesondere nicht im Repository liegen.

Vor einer freigegebenen Ausführung sind Principal, Projekt-Scope und effektive Rollen im Vier-Augen-Prinzip zu kontrollieren. Besitzt das verwendete ADC-Konto breitere Rollen wie Owner, Editor, Firebase Admin oder Datastore User, wird es für diesen Audit nicht verwendet. Diese IAM-Kontrolle selbst ist noch nicht erfolgt, da dafür produktive Projektmetadaten gelesen werden müssten.

## Ausschließlich verwendete Lesefunktionen

1. `auth.listUsers(1000, pageToken)` liest Auth-Konten seitenweise. Intern übernommen werden nur `uid`, `disabled`, der Rollen-Claim `role` und der Mapping-Claim `profile_id`. Identitätsattribute werden nicht übernommen.
2. `users.select("uid", "role").get()` liest nur die für Profilzuordnung und Rollenabgleich benötigten Felder.
3. `trainings.select("created_by_user_id", "created_by_auth_uid").get()` liest nur die Eigentümerreferenzen.
4. `users.where("password", "!=", null).count().get()` zählt Passwortfelder serverseitig, ohne Passwortwerte abzurufen.

Der Produktionspfad enthält keine Aufrufe zum Erstellen, Ändern oder Löschen von Konten, Claims oder Firestore-Dokumenten. Auch Transaktionen und Bulk Writer werden nicht verwendet.

Einschränkung: Ein ausdrücklich mit `null` gespeichertes Passwortfeld wird von der `password != null`-Aggregation nicht gezählt. Das vermeidet bewusst das Laden des Feldwerts. Falls auch solche Nullfelder zwingend erfasst werden sollen, ist vorab ein gesondertes datenschutzgeprüftes Verfahren nötig; der vorbereitete Audit weitet dafür die gelesenen Felder nicht aus.

## Ermittelte Aggregate

Die Ausgabe enthält:

- Gesamtzahl, aktive und deaktivierte Auth-Konten;
- Anzahl Firestore-Profile und eindeutige Profilzuordnungen;
- Profile mit fehlender, nicht vorhandener oder zur Dokument-ID beziehungsweise zum `profile_id`-Claim widersprüchlicher UID;
- Profile mit einem nicht leeren Passwortfeld;
- vorhandene Rollen-Claims sowie fehlende, ungültige oder vom eindeutig zugeordneten Profil abweichende Claims;
- mehrdeutige Profilzuordnungen;
- Trainings insgesamt, Trainings mit `created_by_user_id` und Trainings ohne eindeutige Eigentümerzuordnung.

Legacy-Profile werden eindeutig akzeptiert, wenn ihr `uid`-Feld auf das Auth-Konto zeigt und ihre abweichende Dokument-ID durch dessen serverseitigen `profile_id`-Claim bestätigt wird. Mehrere passende Profile, verwaiste UIDs und widersprüchliche Referenzen werden fail-closed als uneindeutig gezählt.

## Projekt- und Umgebungsabsicherung

Der Produktions-Runner:

- enthält die feste erwartete Projektkennung `coachboarddb`;
- verlangt zusätzlich sowohl `--project coachboarddb` als auch `--confirm-read-only-audit coachboarddb`;
- bricht ab, sobald `FIREBASE_AUTH_EMULATOR_HOST` oder `FIRESTORE_EMULATOR_HOST` gesetzt ist;
- verwendet Application Default Credentials und legt keine Schlüsseldatei an;
- gibt bei Fehlern nur einen Fehlercode und keine Datensätze aus;
- gibt im Erfolgsfall nur Aggregate und Leseumfang aus.

Der lokale Testweg verwendet dagegen fest `demo-coachboard-auth`, Auth unter `127.0.0.1:9099` und Firestore unter `127.0.0.1:8080`. Synthetische Testschreibvorgänge finden ausschließlich dort statt.

## Geschätzte Belastung

Seien `A` die Auth-Konten, `P` die Profile, `T` die Trainings und `W` die Profile mit nicht leerem Passwortfeld:

- Auth API: `ceil(A / 1000)` Listenaufrufe.
- Firestore: `P + T` maskierte Dokumentlesungen.
- Passwort-Aggregation: mindestens eine Dokumentlesung und ungefähr eine berechnete Leseeinheit je bis zu 1000 ausgewerteten Indexeinträgen; konservative Obergrenze `max(1, ceil(P / 1000))`.
- Insgesamt konservativ: `P + T + max(1, ceil(P / 1000))` Firestore-Leseeinheiten, zusätzlich zu den Auth-Listenaufrufen.

Es gibt drei Firestore-Abfragen und die erforderlichen Auth-Seiten. Die tatsächlichen Zahlen sind vor dem ersten Zugriff naturgemäß unbekannt. Vor Freigabe ist anhand der bekannten Vereinsgröße eine maximale Größenordnung schriftlich festzulegen; bei unerwartet hoher Ausgabe findet keine Wiederholung statt.

## Lokale Tests

Ausgeführt gegen die bereits laufenden lokalen Emulatoren mit `demo-coachboard-auth`:

```powershell
$env:GCLOUD_PROJECT='demo-coachboard-auth'
$env:FIREBASE_CONFIG='{"projectId":"demo-coachboard-auth"}'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
npm.cmd run test:firebase
```

Die neuen Audit-Tests decken korrekte, fehlende, widersprüchliche und mehrdeutige Zuordnungen, Legacy-Dokument-IDs, fehlende Claims, deaktivierte Konten, Passwortfeld-Zählung, maskierte Firestore-Lesefelder und anonymisierte Ausgabe ab. Eine statische Regression lehnt bekannte Firebase-Mutationsmethoden im gesamten Produktionspfad ab.

## Produktiver Startbefehl – noch nicht ausführen

Erst nach ausdrücklicher Freigabe, bestätigter IAM-Minimalberechtigung und in einer neuen Shell ohne Emulatorvariablen:

```powershell
node functions/audit/productionReadOnlyAudit.cjs --project coachboarddb --confirm-read-only-audit coachboarddb
```

Die ADC-Anmeldung wird außerhalb des Repositorys eingerichtet. Die Ausgabe wird nicht in das Repository umgeleitet. Vor dem Start sind zu prüfen:

1. Der ausführende Principal besitzt auf `coachboarddb` ausschließlich die vereinbarten Viewer-Rechte.
2. `FIREBASE_AUTH_EMULATOR_HOST` und `FIRESTORE_EMULATOR_HOST` sind nicht gesetzt; umgekehrt darf die Freigabe nicht in einer Emulator-Shell ausgeführt werden.
3. Arbeitsverzeichnis, Git-Diff und feste Projektkennung stimmen.
4. Erwartete Größenordnung und einmalige Ausführung sind protokolliert.
5. Die Terminalausgabe wird nur als anonymisierte Summe behandelt und nicht öffentlich geteilt.

Erwartete Struktur:

```json
{
  "schemaVersion": 1,
  "projectId": "coachboarddb",
  "mode": "READ_ONLY_AGGREGATES_ONLY",
  "summary": {
    "authAccounts": 0,
    "activeAuthAccounts": 0,
    "disabledAuthAccounts": 0,
    "firestoreProfiles": 0,
    "uniqueProfileMappings": 0,
    "profilesWithMissingOrConflictingUid": 0,
    "profilesWithPasswordField": 0,
    "roleClaimsPresent": 0,
    "roleClaimsMissingOrMismatched": 0,
    "ambiguousProfileMappings": 0,
    "trainings": 0,
    "trainingsWithLegacyOwnerReference": 0,
    "trainingsWithUnclearOwner": 0
  }
}
```

Die Nullen sind nur ein Schema-Beispiel und kein Ergebnis aus Produktion.

## Vorgehen bei Abweichungen

- Bei fehlenden oder abweichenden Claims, Profil-UIDs oder Eigentümerzuordnungen: produktive Auth-Umstellung stoppen.
- Keine automatische Korrektur, Migration oder Löschung aus dem Audit heraus.
- Betroffene Fälle nur in einem gesonderten, zugriffsgeschützten Vier-Augen-Verfahren identifizieren. Der Audit-Bericht selbst bleibt aggregiert.
- Mapping-Entscheidungen gegen bestehende Dokument-ID, `uid`, serverseitigen `profile_id`-Claim und Trainingsreferenzen prüfen.
- Jede spätere Änderung benötigt eine eigene Freigabe, Sicherung, Test- und Rücknahmeplanung.

## Rücknahme

Da keine Produktivdaten oder Konfigurationen geändert werden, besteht die Rücknahme ausschließlich aus dem separaten Entfernen der drei neuen Audit-/Testdateien und dieses Berichts. Bereits vorhandene Arbeitsänderungen dürfen dabei nicht berührt werden. Etwaige temporäre IAM-Zuweisungen werden erst nach einer später freigegebenen Ausführung durch einen autorisierten Administrator entfernt; der Audit-Code nimmt selbst keine IAM-Änderung vor.
