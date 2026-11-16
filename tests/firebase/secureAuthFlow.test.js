import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getIdTokenResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { assertFails } from "@firebase/rules-unit-testing";
import {
  createSecureAuthFlow,
  getLoginErrorMessage,
  SecureAuthError
} from "../../Backend/secureAuthFlow.js";
import { installLocalNetworkGuard } from "./emulatorSafety.js";
import { SYNTHETIC_ACCOUNTS, SYNTHETIC_DOCUMENT_IDS } from "./fixtures/syntheticAccounts.js";
import {
  createFirebaseTestHarness,
  resetSyntheticState,
  seedSyntheticState
} from "./testFirebase.js";

let harness;
let seeded;
let restoreNetwork;

function waitForState(states, predicate, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const existing = states.find(predicate);
    if (existing) {
      resolve(existing);
      return;
    }

    const timeout = setTimeout(() => reject(new Error("Auth-Zustand wurde nicht rechtzeitig erreicht.")), timeoutMs);
    const interval = setInterval(() => {
      const matched = states.find(predicate);
      if (!matched) return;
      clearTimeout(timeout);
      clearInterval(interval);
      resolve(matched);
    }, 10);
  });
}

function createEmulatorFlow(states, profileIdOverride = null) {
  return createSecureAuthFlow({
    loginWithEmailPassword: (email, password) => signInWithEmailAndPassword(harness.auth, email, password),
    observeAuthState: (callback) => onAuthStateChanged(harness.auth, callback),
    logoutFromAuth: () => signOut(harness.auth),
    readTokenClaims: async (user) => {
      const result = await getIdTokenResult(user);
      return profileIdOverride ? { ...result.claims, profile_id: profileIdOverride } : result.claims;
    },
    readProfile: async (profileId, user, claims) => {
      const db = harness.testEnv.authenticatedContext(user.uid, claims).firestore();
      const snapshot = await getDoc(doc(db, "users", profileId));
      return snapshot.exists() ? snapshot.data() : null;
    },
    onStateChange: (state) => states.push(state)
  });
}

function createControlledFlow({
  user,
  claims = {},
  profile,
  loginError = null,
  validateAuthSession = async () => true
}) {
  let observer = null;
  let logoutCalls = 0;
  const states = [];
  const flow = createSecureAuthFlow({
    loginWithEmailPassword: async () => {
      if (loginError) throw loginError;
      return { user };
    },
    observeAuthState: (callback) => {
      observer = callback;
      return () => { observer = null; };
    },
    logoutFromAuth: async () => {
      logoutCalls += 1;
      observer?.(null);
    },
    validateAuthSession,
    readTokenClaims: async () => claims,
    readProfile: async () => profile,
    onStateChange: (state) => states.push(state)
  });

  return {
    flow,
    states,
    emit: (nextUser) => observer?.(nextUser),
    getLogoutCalls: () => logoutCalls
  };
}

before(async () => {
  restoreNetwork = installLocalNetworkGuard();
  harness = await createFirebaseTestHarness("secure-auth-flow", "firestore.target.rules");
});

beforeEach(async () => {
  await resetSyntheticState(harness);
  seeded = await seedSyntheticState(harness);
});

after(async () => {
  await harness?.cleanup();
  restoreNetwork?.();
});

test("E-Mail-Login authentifiziert modern und lädt erst danach gezielt das eigene Profil", async () => {
  const states = [];
  const flow = createEmulatorFlow(states);
  flow.start();

  await flow.loginWithEmail(SYNTHETIC_ACCOUNTS.modern.email.toUpperCase(), SYNTHETIC_ACCOUNTS.modern.password);
  const authenticated = await waitForState(states, (state) => state.status === "authenticated");

  assert.equal(authenticated.user.uid, seeded.modernUid);
  assert.equal(authenticated.profile.id, seeded.modernUid);
  assert.equal(authenticated.profile.uid, seeded.modernUid);
  assert.equal(authenticated.role, "spieler");
  assert.equal(Object.hasOwn(authenticated.profile, "password"), false);
  flow.dispose();
});

test("Ungültiges Passwort wird ausschließlich durch Firebase Auth abgewiesen", async () => {
  const states = [];
  const flow = createEmulatorFlow(states);
  flow.start();

  await assert.rejects(
    () => flow.loginWithEmail(SYNTHETIC_ACCOUNTS.modern.email, "synthetic-invalid-password"),
    /auth\/(invalid-credential|wrong-password)/
  );
  assert.equal(states.some((state) => state.status === "authenticated"), false);
  flow.dispose();
});

test("Firebase-Loginfehler werden ohne Passwort- oder Tokenausgabe sinnvoll unterschieden", () => {
  assert.equal(
    getLoginErrorMessage({ code: "auth/invalid-credential" }),
    "Die Anmeldedaten sind ungültig. Bitte E-Mail-Adresse und Passwort erneut eingeben."
  );
  assert.equal(
    getLoginErrorMessage({ code: "auth/wrong-password" }),
    "Das eingegebene Passwort ist nicht korrekt."
  );
  assert.match(getLoginErrorMessage({ code: "auth/user-disabled" }), /deaktiviert/);
  assert.match(getLoginErrorMessage({ code: "auth/too-many-requests" }), /Zu viele/);
  assert.match(getLoginErrorMessage({ code: "auth/network-request-failed" }), /Netzwerk/);
  assert.doesNotMatch(
    getLoginErrorMessage({ code: "auth/internal-error", message: "secret-value" }),
    /secret-value/
  );
});

test("Browser-Neuladen wird durch einen neuen Observer auf derselben Auth-Sitzung wiederhergestellt", async () => {
  const firstStates = [];
  const firstFlow = createEmulatorFlow(firstStates);
  firstFlow.start();
  await firstFlow.loginWithEmail(SYNTHETIC_ACCOUNTS.modern.email, SYNTHETIC_ACCOUNTS.modern.password);
  await waitForState(firstStates, (state) => state.status === "authenticated");
  firstFlow.dispose();

  const reloadStates = [];
  const reloadedFlow = createEmulatorFlow(reloadStates);
  reloadedFlow.start();
  const restored = await waitForState(reloadStates, (state) => state.status === "authenticated");
  assert.equal(restored.user.uid, seeded.modernUid);
  reloadedFlow.dispose();
});

test("Sicherer Logout beendet die Firebase-Auth-Sitzung", async () => {
  const states = [];
  const flow = createEmulatorFlow(states);
  flow.start();
  await flow.loginWithEmail(SYNTHETIC_ACCOUNTS.modern.email, SYNTHETIC_ACCOUNTS.modern.password);
  await waitForState(states, (state) => state.status === "authenticated");
  await flow.logout();
  await waitForState(states, (state) => state.status === "signed-out");
  assert.equal(harness.auth.currentUser, null);
  flow.dispose();
});

test("Legacy-Profil ohne Auth-Konto kann sich nicht anmelden", async () => {
  const flow = createEmulatorFlow([]);
  flow.start();
  await assert.rejects(
    () => flow.loginWithEmail(
      SYNTHETIC_ACCOUNTS.legacyPassword.email,
      SYNTHETIC_ACCOUNTS.legacyPassword.password
    ),
    /auth\/(invalid-credential|user-not-found)/
  );
  flow.dispose();
});

test("Abweichende Legacy-Dokument-ID funktioniert nur mit serverseitiger profile_id-Zuordnung", async () => {
  const withoutClaimStates = [];
  const withoutClaim = createEmulatorFlow(withoutClaimStates);
  withoutClaim.start();
  await withoutClaim.loginWithEmail(SYNTHETIC_ACCOUNTS.migrated.email, SYNTHETIC_ACCOUNTS.migrated.password);
  const errorState = await waitForState(withoutClaimStates, (state) => state.status === "error");
  assert.equal(errorState.error.code, "profile-load-failed");
  await waitForState(withoutClaimStates, (state) => state.status === "signed-out");
  withoutClaim.dispose();

  const withClaimStates = [];
  const withClaim = createEmulatorFlow(withClaimStates, SYNTHETIC_DOCUMENT_IDS.migrated);
  withClaim.start();
  await withClaim.loginWithEmail(SYNTHETIC_ACCOUNTS.migrated.email, SYNTHETIC_ACCOUNTS.migrated.password);
  const authenticated = await waitForState(withClaimStates, (state) => state.status === "authenticated");
  assert.equal(authenticated.profile.id, SYNTHETIC_DOCUMENT_IDS.migrated);
  assert.equal(authenticated.profile.uid, seeded.migratedUid);
  withClaim.dispose();
});

test("Benutzernamen-Login bleibt ohne geschützten Backend-Resolver fail-closed", async () => {
  const flow = createEmulatorFlow([]);
  await assert.rejects(
    () => flow.loginWithIdentifier("synthetic-modern", "unused"),
    (error) => error instanceof SecureAuthError && error.code === "username-login-requires-backend"
  );
  flow.dispose();
});

test("Fehlende E-Mail und leeres Passwort werden vor Firebase Auth abgewiesen", async () => {
  const flow = createEmulatorFlow([]);
  await assert.rejects(
    () => flow.loginWithEmail("not-an-email", "unused"),
    (error) => error instanceof SecureAuthError && error.code === "invalid-email"
  );
  await assert.rejects(
    () => flow.loginWithEmail(SYNTHETIC_ACCOUNTS.modern.email, ""),
    (error) => error instanceof SecureAuthError && error.code === "missing-password"
  );
  flow.dispose();
});

test("Serverseitige Trainer- und Admin-Claims bestimmen die Rolle, nicht das Profilfeld", async () => {
  for (const role of ["trainer", "admin"]) {
    const user = { uid: `${role}-auth-uid`, email: `${role}@example.invalid` };
    const controlled = createControlledFlow({
      user,
      claims: { role, profile_id: `legacy-${role}-profile` },
      profile: {
        uid: user.uid,
        email: user.email,
        username: `synthetic-${role}`,
        club: "Synthetic FC",
        role: role === "admin" ? "spieler" : "admin"
      }
    });
    controlled.flow.start();
    controlled.emit(user);
    await waitForState(controlled.states, (state) => state.status === "authenticated");
    assert.equal(controlled.flow.getState().role, role);
    assert.equal(controlled.flow.getState().profile.role, undefined);
    controlled.flow.dispose();
  }
});

test("Fehlender oder falscher Rollen-Claim wird auf minimale Spielerrolle reduziert", async () => {
  for (const claims of [{}, { role: "administrator" }]) {
    const user = { uid: `claim-user-${Object.keys(claims).length}`, email: "claim@example.invalid" };
    const controlled = createControlledFlow({
      user,
      claims,
      profile: { uid: user.uid, email: user.email, username: "synthetic-claim", role: "admin" }
    });
    controlled.flow.start();
    controlled.emit(user);
    await waitForState(controlled.states, (state) => state.status === "authenticated");
    assert.equal(controlled.flow.getState().role, "spieler");
    controlled.flow.dispose();
  }
});

test("Passwortprofil und UID-Konflikt führen fail-closed zum Logout", async () => {
  const cases = [
    {
      profile: { uid: "secure-user", password: "synthetic-never-used" },
      code: "legacy-password-profile-blocked"
    },
    {
      profile: { uid: "different-user" },
      code: "profile-uid-mismatch"
    }
  ];

  for (const currentCase of cases) {
    const user = { uid: "secure-user", email: "secure@example.invalid" };
    const controlled = createControlledFlow({ user, profile: currentCase.profile });
    controlled.flow.start();
    controlled.emit(user);
    const errorState = await waitForState(controlled.states, (state) => state.status === "error");
    assert.equal(errorState.error.code, currentCase.code);
    assert.equal(controlled.getLogoutCalls(), 1);
    controlled.flow.dispose();
  }
});

test("Gesperrtes Konto wird ohne Profilzugriff abgewiesen", async () => {
  const disabledError = Object.assign(new Error("Account disabled"), { code: "auth/user-disabled" });
  const user = { uid: "disabled-user", email: "disabled@example.invalid" };
  const controlled = createControlledFlow({ user, profile: null, loginError: disabledError });
  await assert.rejects(() => controlled.flow.loginWithEmail(user.email, "synthetic-password"), {
    code: "auth/user-disabled"
  });
  assert.equal(controlled.states.length, 0);
  controlled.flow.dispose();
});

test("Abgelaufene oder entzogene Sitzung wird durch Auth-Observer beendet", async () => {
  const user = { uid: "session-user", email: "session@example.invalid" };
  const controlled = createControlledFlow({
    user,
    profile: { uid: user.uid, email: user.email, username: "synthetic-session" }
  });
  controlled.flow.start();
  controlled.emit(user);
  await waitForState(controlled.states, (state) => state.status === "authenticated");
  controlled.emit(null);
  await waitForState(controlled.states, (state) => state.status === "signed-out");
  assert.equal(controlled.flow.getState().user, null);
  controlled.flow.dispose();
});

test("Widerrufene Sitzung wird bei der nächsten erzwungenen Prüfung sicher abgemeldet", async () => {
  const user = { uid: "revoked-session-user", email: "revoked@example.invalid" };
  const controlled = createControlledFlow({
    user,
    profile: { uid: user.uid, email: user.email },
    validateAuthSession: async () => {
      throw Object.assign(new Error("revoked"), { code: "auth/user-token-expired" });
    }
  });

  controlled.flow.start();
  controlled.emit(user);
  await waitForState(controlled.states, (state) => state.status === "authenticated");
  await assert.rejects(() => controlled.flow.validateSession(), { code: "session-invalid" });
  assert.equal(controlled.getLogoutCalls(), 1);
  assert.equal(controlled.flow.getState().status, "signed-out");
  controlled.flow.dispose();
});

test("Parallele Sitzungsprüfungen verwenden nur einen Token-Refresh", async () => {
  let validationCalls = 0;
  let releaseValidation;
  const validation = new Promise((resolve) => { releaseValidation = resolve; });
  const controlled = createControlledFlow({
    user: { uid: "parallel-session-user" },
    profile: { uid: "parallel-session-user" },
    validateAuthSession: async () => {
      validationCalls += 1;
      await validation;
    }
  });

  const first = controlled.flow.validateSession();
  const second = controlled.flow.validateSession();
  releaseValidation();
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(validationCalls, 1);
  controlled.flow.dispose();
});

test("Falscher Claim gewährt unter Zielregeln keine Trainer-Schreibrechte", async () => {
  const db = harness.testEnv.authenticatedContext(seeded.modernUid, { role: "administrator" }).firestore();
  await assertFails(setDoc(doc(db, "exercises", "wrong-claim-exercise"), { title: "Denied" }));
});
