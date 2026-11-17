import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const {
  actionConfirmation,
  assertRuntimeIsolation,
  collectInput,
  execute,
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

test("Spark-Admin-CLI leitet die Freigabe registrierter Konten an den Admin-Service", async () => {
  let received = null;
  const service = {
    approvePendingUser: async (caller, input) => {
      received = { caller, input };
      return { uid: input.uid, role: input.role };
    }
  };
  const caller = { uid: "admin-uid", token: { role: "admin" } };
  const input = { uid: "pending-uid", role: "spieler" };
  const approved = await execute(service, caller, "approve", input);
  assert.deepEqual(received, { caller, input });
  assert.deepEqual(approved, { uid: "pending-uid", role: "spieler" });
});

test("Spark-Admin-CLI verlangt vor der Freigabe die externe Identitäts- und E-Mail-Prüfung", async () => {
  const rejectedAnswers = ["pending-uid", "nicht geprüft"];
  await assert.rejects(() => collectInput("approve", {
    question: async () => rejectedAnswers.shift()
  }), /nicht bestätigt/);

  const acceptedAnswers = [
    "pending-uid",
    "IDENTITAET UND E-MAIL GEPRUEFT",
    "synthetic-pending",
    "Synthetic FC",
    "spieler"
  ];
  const action = await collectInput("approve", {
    question: async () => acceptedAnswers.shift()
  });
  assert.deepEqual(action.input, {
    uid: "pending-uid",
    username: "synthetic-pending",
    club: "Synthetic FC",
    role: "spieler",
    identityVerified: true,
    emailAddressVerifiedExternally: true
  });
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
  const [usersService, functionsIndex, main] = await Promise.all([
    readFile(new URL("../../Backend/usersService.js", import.meta.url), "utf8"),
    readFile(new URL("../../functions/index.js", import.meta.url), "utf8"),
    readFile(new URL("../../Backend/main.js", import.meta.url), "utf8")
  ]);
  assert.equal(usersService.includes("adminUsersService"), false);
  assert.equal(usersService.includes("httpsCallable"), false);
  assert.equal(functionsIndex.includes("adminListUsers"), false);
  assert.equal(functionsIndex.includes("adminCreateUser"), false);
  assert.match(
    usersService,
    /function fetchUsers\(\)[\s\S]*?if \(isSecureAuthMode\)[\s\S]*?throw new Error[\s\S]*?getDocs\(collection\(db, "users"\)\)/
  );
  assert.match(
    main,
    /userManagementNav\?\.classList\.toggle\("is-hidden", !isAdmin \|\| isSecureAuthMode\)/
  );
  assert.match(main, /if \(!isSecureAuthMode[\s\S]*?state\.activeView = "user-management"/);
});

test("Produktive Selbstregistrierung schreibt nur in Firebase Auth und zeigt den Freigabeprozess", async () => {
  const [html, authService, main] = await Promise.all([
    readFile(new URL("../../Backend/index.html", import.meta.url), "utf8"),
    readFile(new URL("../../Backend/authService.js", import.meta.url), "utf8"),
    readFile(new URL("../../Backend/main.js", import.meta.url), "utf8")
  ]);
  assert.match(html, /data-auth-tab="register">Registrieren</);
  assert.match(html, /name="password_confirmation"/);
  assert.match(html, /id="back-to-login-btn"/);
  assert.match(authService, /registerPendingAccount[\s\S]*createUserWithEmailAndPassword/);
  const registrationImplementation = authService.match(
    /export async function registerPendingAccount[\s\S]*?\r?\n}\r?\n\r?\n\/\/ Logout/
  )?.[0] || "";
  assert.notEqual(registrationImplementation, "");
  assert.doesNotMatch(registrationImplementation, /sendEmailVerification/);
  assert.doesNotMatch(authService, /registerPendingAccount[\s\S]*setDoc\(/);
  assert.match(main, /registerPendingAccount\(username, email, password\)/);
  assert.doesNotMatch(main, /registerPendingAccount\([^)]*role/);
  assert.match(main, /Es wird keine Bestätigungs-E-Mail versendet/);
});
