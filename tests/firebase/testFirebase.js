import fs from "node:fs";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signOut
} from "firebase/auth";
import {
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  PROJECT_ID,
  AUTH_EMULATOR_HOST,
  FIRESTORE_EMULATOR_HOST,
  assertEmulatorSafety
} from "./emulatorSafety.js";
import { SYNTHETIC_ACCOUNTS, SYNTHETIC_DOCUMENT_IDS } from "./fixtures/syntheticAccounts.js";

const [authHost, authPortText] = AUTH_EMULATOR_HOST.split(":");
const [firestoreHost, firestorePortText] = FIRESTORE_EMULATOR_HOST.split(":");

const ALLOWED_RULE_FILES = new Set([
  "firestore.test.rules",
  "firestore.mitigation.rules",
  "firestore.target.rules"
]);

export async function createFirebaseTestHarness(testName, ruleFile = "firestore.test.rules") {
  assertEmulatorSafety();

  if (!ALLOWED_RULE_FILES.has(ruleFile)) {
    throw new Error(`Nicht freigegebene Firestore-Regeldatei: ${ruleFile}`);
  }

  const app = initializeApp(
    {
      apiKey: "synthetic-emulator-key",
      authDomain: `${PROJECT_ID}.invalid`,
      projectId: PROJECT_ID,
      appId: `synthetic:${testName}`
    },
    `emulator-${testName}-${Date.now()}-${Math.random()}`
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}:${Number(authPortText)}`, { disableWarnings: true });

  const rules = fs.readFileSync(new URL(`../../${ruleFile}`, import.meta.url), "utf8");
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: firestoreHost,
      port: Number(firestorePortText),
      rules
    }
  });

  return {
    app,
    auth,
    testEnv,
    async cleanup() {
      await signOut(auth).catch(() => {});
      await testEnv.cleanup();
      await deleteApp(app);
    }
  };
}

export async function clearAuthEmulator() {
  const response = await fetch(
    `http://${AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`,
    { method: "DELETE" }
  );

  if (!response.ok) {
    throw new Error(`Authentication Emulator konnte nicht geleert werden: ${response.status}`);
  }
}

export async function resetSyntheticState(harness) {
  await harness.testEnv.clearFirestore();
  await clearAuthEmulator();
  await signOut(harness.auth).catch(() => {});
}

async function createAuthUser(auth, account) {
  const credential = await createUserWithEmailAndPassword(auth, account.email, account.password);
  const uid = credential.user.uid;
  await signOut(auth);
  return uid;
}

export async function seedSyntheticState(harness) {
  const modernUid = await createAuthUser(harness.auth, SYNTHETIC_ACCOUNTS.modern);
  const migratedUid = await createAuthUser(harness.auth, SYNTHETIC_ACCOUNTS.migrated);
  const orphanAuthUid = await createAuthUser(harness.auth, SYNTHETIC_ACCOUNTS.orphanAuth);

  await harness.testEnv.withSecurityRulesDisabled(async (context) => {
    const { doc, setDoc } = await import("firebase/firestore");
    const db = context.firestore();

    await setDoc(doc(db, "users", modernUid), {
      uid: modernUid,
      email: SYNTHETIC_ACCOUNTS.modern.email,
      username: SYNTHETIC_ACCOUNTS.modern.username,
      role: SYNTHETIC_ACCOUNTS.modern.role,
      club: "Synthetic FC"
    });
    await setDoc(doc(db, "users", SYNTHETIC_DOCUMENT_IDS.migrated), {
      uid: migratedUid,
      email: SYNTHETIC_ACCOUNTS.migrated.email,
      username: SYNTHETIC_ACCOUNTS.migrated.username,
      role: SYNTHETIC_ACCOUNTS.migrated.role,
      club: "Synthetic FC"
    });
    await setDoc(doc(db, "users", SYNTHETIC_DOCUMENT_IDS.legacyPassword), {
      email: SYNTHETIC_ACCOUNTS.legacyPassword.email,
      username: SYNTHETIC_ACCOUNTS.legacyPassword.username,
      password: SYNTHETIC_ACCOUNTS.legacyPassword.password,
      role: SYNTHETIC_ACCOUNTS.legacyPassword.role,
      club: "Synthetic FC"
    });
    await setDoc(doc(db, "users", SYNTHETIC_DOCUMENT_IDS.legacyNoPassword), {
      email: SYNTHETIC_ACCOUNTS.legacyNoPassword.email,
      username: SYNTHETIC_ACCOUNTS.legacyNoPassword.username,
      role: SYNTHETIC_ACCOUNTS.legacyNoPassword.role,
      club: "Synthetic FC"
    });
    await setDoc(doc(db, "users", SYNTHETIC_DOCUMENT_IDS.missingEmail), {
      username: SYNTHETIC_ACCOUNTS.missingEmail.username,
      role: SYNTHETIC_ACCOUNTS.missingEmail.role,
      club: "Synthetic FC"
    });
    await setDoc(doc(db, "users", SYNTHETIC_DOCUMENT_IDS.duplicateOne), {
      email: SYNTHETIC_ACCOUNTS.duplicate.email,
      username: SYNTHETIC_ACCOUNTS.duplicate.username,
      role: SYNTHETIC_ACCOUNTS.duplicate.role
    });
    await setDoc(doc(db, "users", SYNTHETIC_DOCUMENT_IDS.duplicateTwo), {
      email: SYNTHETIC_ACCOUNTS.duplicate.email,
      username: SYNTHETIC_ACCOUNTS.duplicate.username,
      role: SYNTHETIC_ACCOUNTS.duplicate.role
    });
    await setDoc(doc(db, "users", SYNTHETIC_DOCUMENT_IDS.orphanProfile), {
      uid: "synthetic-missing-auth-uid",
      email: "orphan.profile@example.invalid",
      username: "synthetic-orphan-profile",
      role: "spieler"
    });
    await setDoc(doc(db, "trainings", SYNTHETIC_DOCUMENT_IDS.training), {
      title: "Synthetic reference training",
      created_by_user_id: SYNTHETIC_DOCUMENT_IDS.legacyPassword
    });
    await setDoc(doc(db, "exercises", SYNTHETIC_DOCUMENT_IDS.exercise), {
      title: "Synthetic exercise",
      created_by_user_id: modernUid
    });
  });

  return { modernUid, migratedUid, orphanAuthUid };
}
