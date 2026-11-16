const { spawnSync } = require("node:child_process");
const path = require("node:path");

const projectId = "demo-coachboard-auth";
const configFile = "firebase.emulator.json";

if (!projectId.startsWith("demo-")) {
  throw new Error("Unsichere Firebase-Projektkennung. Emulatorstart abgebrochen.");
}

const firebaseCli = path.resolve("node_modules/firebase-tools/lib/bin/firebase.js");
const result = spawnSync(
  process.execPath,
  [
    firebaseCli,
    "emulators:exec",
    "--project",
    projectId,
    "--config",
    configFile,
    "--only",
    "auth,firestore",
    "npm run test:firebase"
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CI: "true",
      FIREBASE_CLI_DISABLE_UPDATE_CHECK: "true"
    },
    stdio: "inherit",
    shell: false
  }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
