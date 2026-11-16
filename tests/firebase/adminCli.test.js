import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const {
  actionConfirmation,
  assertRuntimeIsolation,
  parseArguments,
  sanitizeResult
} = require("../../functions/adminCli.cjs");

test("Spark-Admin-CLI parst nur explizite Betriebsparameter", () => {
  assert.deepEqual(parseArguments([
    "list", "--mode", "production", "--project", "coachboarddb"
  ]), {
    command: "list",
    options: { mode: "production", project: "coachboarddb" }
  });
  assert.throws(() => parseArguments(["list", "--mode"]), /Ungültige CLI-Argumente/);
});

test("Spark-Admin-CLI blockiert falsche Projektkennung und gemischten Betrieb", () => {
  assert.throws(() => assertRuntimeIsolation({
    mode: "production",
    project: "wrong-project",
    confirmProject: "wrong-project"
  }), /doppelte Projektbestätigung/);

  const previousAuth = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  try {
    assert.throws(() => assertRuntimeIsolation({
      mode: "production",
      project: "coachboarddb",
      confirmProject: "coachboarddb"
    }), /nicht vermischt/);
  } finally {
    if (previousAuth === undefined) delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    else process.env.FIREBASE_AUTH_EMULATOR_HOST = previousAuth;
  }
});

test("Spark-Admin-CLI erzeugt aktionsgebundene Bestätigung und anonymisierte Ausgabe", () => {
  assert.notEqual(actionConfirmation("delete", "uid-a"), actionConfirmation("disable", "uid-a"));
  assert.notEqual(actionConfirmation("delete", "uid-a"), actionConfirmation("delete", "uid-b"));
  const output = sanitizeResult({
    uid: "uid-a",
    profileId: "profile-a",
    role: "trainer",
    disabled: false,
    email: "sensitive@example.invalid",
    username: "Sensitive"
  });
  assert.deepEqual(output, [{
    uid: "uid-a",
    profileId: "profile-a",
    role: "trainer",
    disabled: false,
    deleted: false,
    mappingStatus: ""
  }]);
  assert.equal(JSON.stringify(output).includes("sensitive"), false);
});

test("sicherer Website-Modus besitzt keine administrative Callable-Anbindung", async () => {
  const [usersService, functionsIndex] = await Promise.all([
    readFile(new URL("../../Backend/usersService.js", import.meta.url), "utf8"),
    readFile(new URL("../../functions/index.js", import.meta.url), "utf8")
  ]);
  assert.equal(usersService.includes("adminUsersService"), false);
  assert.equal(usersService.includes("httpsCallable"), false);
  assert.equal(functionsIndex.includes("adminListUsers"), false);
  assert.equal(functionsIndex.includes("adminCreateUser"), false);
});
