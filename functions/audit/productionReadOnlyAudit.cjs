"use strict";

const { applicationDefault, deleteApp, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { analyzeReadOnlyAudit, collectReadOnlySnapshot } = require("./readOnlyAudit.cjs");

const EXPECTED_PROJECT_ID = "coachboarddb";
const args = new Map();

for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

function abort(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

async function main() {
  const requestedProject = args.get("--project");
  const confirmation = args.get("--confirm-read-only-audit");

  if (requestedProject !== EXPECTED_PROJECT_ID || confirmation !== EXPECTED_PROJECT_ID) {
    abort("Audit abgebrochen: Projektkennung und explizite Read-only-Bestätigung müssen coachboarddb entsprechen.");
    return;
  }

  if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
    abort("Audit abgebrochen: Produktionsaudit und Emulatorbetrieb dürfen nicht vermischt werden.");
    return;
  }

  const app = initializeApp({
    credential: applicationDefault(),
    projectId: EXPECTED_PROJECT_ID
  }, "coachboard-read-only-audit");

  try {
    const snapshot = await collectReadOnlySnapshot({
      auth: getAuth(app),
      firestore: getFirestore(app)
    });
    const summary = analyzeReadOnlyAudit(snapshot);

    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      projectId: EXPECTED_PROJECT_ID,
      mode: "READ_ONLY_AGGREGATES_ONLY",
      summary,
      readEstimate: snapshot.readEstimate,
      limitations: [
        "Password fields explicitly stored as null are not counted by the password != null aggregation.",
        "No names, email addresses, document IDs, UIDs, password values, or per-account rows are emitted."
      ]
    }, null, 2)}\n`);
  } catch (error) {
    abort(`Audit fehlgeschlagen: ${error?.code || "unknown-read-error"}`);
  } finally {
    await deleteApp(app).catch(() => {});
  }
}

void main();
