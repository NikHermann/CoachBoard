const { spawnSync } = require("node:child_process");
const path = require("node:path");

const projectId = "demo-coachboard-auth";
const configFile = "firebase.emulator.json";
const variants = [
  "tests/firebase/firestoreMitigationRules.test.js",
  "tests/firebase/firestoreTargetRules.test.js"
];

if (!projectId.startsWith("demo-")) {
  throw new Error("Unsichere Firebase-Projektkennung. Variantentests abgebrochen.");
}

const firebaseCli = path.resolve("node_modules/firebase-tools/lib/bin/firebase.js");

for (const testFile of variants) {
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
      `node --test --test-concurrency=1 ${testFile}`
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CI: "true",
        DEBUG: "",
        FIREBASE_CLI_DISABLE_UPDATE_CHECK: "true"
      },
      stdio: "inherit",
      shell: false
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
