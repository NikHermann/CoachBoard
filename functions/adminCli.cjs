"use strict";

const { createHash } = require("node:crypto");
const { createInterface } = require("node:readline/promises");
const { stdin, stdout, stderr } = require("node:process");
const { applicationDefault, deleteApp, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { createAdminProvisioningService } = require("./adminProvisioningService");

const PRODUCTION_PROJECT_ID = "coachboarddb";
const EMULATOR_PROJECT_ID = "demo-coachboard-auth";
const AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const COMMANDS = new Set(["list", "create", "update", "role", "disable", "enable", "delete", "link"]);

function parseArguments(argv) {
  const options = {};
  let command = "";
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--") && !command) {
      command = value;
      continue;
    }
    if (!value.startsWith("--") || index + 1 >= argv.length) {
      throw new Error("Ungültige CLI-Argumente.");
    }
    options[value.slice(2)] = argv[index + 1];
    index += 1;
  }
  return { command, options };
}

function assertRuntimeIsolation({ mode, project, confirmProject }) {
  if (mode === "emulator") {
    if (project !== EMULATOR_PROJECT_ID
      || process.env.FIREBASE_AUTH_EMULATOR_HOST !== AUTH_EMULATOR_HOST
      || process.env.FIRESTORE_EMULATOR_HOST !== FIRESTORE_EMULATOR_HOST) {
      throw new Error("Emulatorbetrieb ist nicht eindeutig auf demo-coachboard-auth und localhost begrenzt.");
    }
    return;
  }
  if (mode !== "production" || project !== PRODUCTION_PROJECT_ID || confirmProject !== PRODUCTION_PROJECT_ID) {
    throw new Error("Produktionsmodus erfordert die doppelte Projektbestätigung coachboarddb.");
  }
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Produktions- und Emulatorbetrieb dürfen nicht vermischt werden.");
  }
}

function actionConfirmation(command, target) {
  const fingerprint = createHash("sha256").update(String(target || "all")).digest("hex").slice(0, 12);
  return `${PRODUCTION_PROJECT_ID}:${command}:${fingerprint}`;
}

function sanitizeResult(value) {
  const items = Array.isArray(value) ? value : [value];
  return items.map((item) => ({
    uid: item?.uid || "",
    profileId: item?.profileId || "",
    role: item?.role || "",
    disabled: Boolean(item?.disabled),
    deleted: Boolean(item?.deleted),
    mappingStatus: item?.mappingStatus || ""
  }));
}

async function verifyAdcIdentity(credential, expectedEmail) {
  if (!expectedEmail) throw new Error("Die erwartete ADC-Identität fehlt.");
  const token = await credential.getAccessToken();
  const accessToken = typeof token === "string" ? token : token?.access_token;
  if (!accessToken) throw new Error("ADC-Zugriffstoken konnte nicht geprüft werden.");
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
  const identity = await response.json();
  if (!response.ok || String(identity.email || "").toLowerCase() !== expectedEmail.toLowerCase()) {
    throw new Error("Die aktive Application-Default-Identität stimmt nicht mit der bestätigten Identität überein.");
  }
}

async function collectInput(command, prompt) {
  if (command === "list") return { target: "all", input: {} };
  if (command === "create") {
    const email = (await prompt.question("E-Mail: ")).trim();
    return {
      target: email,
      input: {
        email,
        username: (await prompt.question("Benutzername: ")).trim(),
        club: (await prompt.question("Verein: ")).trim(),
        role: (await prompt.question("Rolle (spieler/trainer/admin): ")).trim()
      }
    };
  }
  const uid = (await prompt.question("Ziel-UID: ")).trim();
  if (command === "update") {
    return {
      target: uid,
      input: {
        uid,
        username: (await prompt.question("Neuer Benutzername: ")).trim(),
        club: (await prompt.question("Neuer Verein: ")).trim(),
        role: (await prompt.question("Neue Rolle (spieler/trainer/admin): ")).trim()
      }
    };
  }
  if (command === "role") {
    return { target: uid, input: { uid, role: (await prompt.question("Neue Rolle (spieler/trainer/admin): ")).trim() } };
  }
  if (command === "link") {
    const profileId = (await prompt.question("Bestehende Firestore-Profil-ID: ")).trim();
    const role = (await prompt.question("Rolle (spieler/trainer/admin): ")).trim();
    const verified = (await prompt.question("Identität geprüft? Exakt IDENTITAET GEPRUEFT eingeben: ")).trim();
    if (verified !== "IDENTITAET GEPRUEFT") throw new Error("Identitätsprüfung wurde nicht bestätigt.");
    return { target: uid, input: { uid, profileId, role, identityVerified: true } };
  }
  return { target: uid, input: { uid } };
}

async function execute(service, caller, command, input) {
  if (command === "list") return service.listUsers(caller);
  if (command === "create") return service.createUser(caller, input);
  if (command === "update") return service.updateUser(caller, input);
  if (command === "role") return service.setRole(caller, input.uid, input.role);
  if (command === "disable") return service.disableUser(caller, input.uid);
  if (command === "enable") return service.reactivateUser(caller, input.uid);
  if (command === "delete") return service.deleteUser(caller, input.uid);
  if (command === "link") return service.linkExistingUser(caller, input);
  throw new Error("Unbekannter Admin-Befehl.");
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (!COMMANDS.has(command) || !options.mode || !options.project || !options["admin-uid"]) {
    throw new Error("Aufruf: adminCli.cjs <list|create|update|role|disable|enable|delete|link> --mode <emulator|production> --project <id> --admin-uid <uid> [--confirm-project coachboarddb] [--operator-email <adc-email>]");
  }
  assertRuntimeIsolation({ mode: options.mode, project: options.project, confirmProject: options["confirm-project"] });

  const prompt = createInterface({ input: stdin, output: stdout });
  let app;
  try {
    const action = await collectInput(command, prompt);
    const expected = actionConfirmation(command, action.target);
    const confirmed = (await prompt.question(`Aktion bestätigen mit ${expected}: `)).trim();
    if (confirmed !== expected) throw new Error("Administrative Aktion wurde nicht bestätigt.");

    const credential = options.mode === "production" ? applicationDefault() : undefined;
    if (credential) await verifyAdcIdentity(credential, options["operator-email"]);
    const appOptions = credential
      ? { credential, projectId: options.project }
      : { projectId: options.project };
    app = initializeApp(appOptions, `coachboard-admin-${Date.now()}`);
    const service = createAdminProvisioningService({
      auth: getAuth(app),
      firestore: getFirestore(app),
      fieldValue: FieldValue
    });
    const result = await execute(service, {
      uid: options["admin-uid"],
      token: { role: "admin" }
    }, command, action.input);
    stdout.write(`${JSON.stringify({ ok: true, command, result: sanitizeResult(result) }, null, 2)}\n`);
  } finally {
    prompt.close();
    if (app) await deleteApp(app).catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    stderr.write(`Admin-CLI abgebrochen: ${error?.code || error?.message || "unbekannter-fehler"}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  actionConfirmation,
  assertRuntimeIsolation,
  execute,
  parseArguments,
  sanitizeResult
};
