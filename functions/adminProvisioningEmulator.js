// Isolierter Phase-3-Adapter. Nicht aus functions/index.js exportiert.
const { getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { createAdminProvisioningService } = require("./adminProvisioningService");

const DEMO_PROJECT_ID = "demo-coachboard-auth";
const LOCAL_AUTH_HOST = "127.0.0.1:9099";
const LOCAL_FIRESTORE_HOST = "127.0.0.1:8080";

function assertEmulatorIsolation() {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (projectId !== DEMO_PROJECT_ID || !projectId.startsWith("demo-")) {
    throw new Error("Admin-Provisionierung ist nur für das freigegebene Demo-Projekt erlaubt.");
  }
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== LOCAL_AUTH_HOST) {
    throw new Error("Authentication Emulator ist nicht eindeutig auf localhost festgelegt.");
  }
  if (process.env.FIRESTORE_EMULATOR_HOST !== LOCAL_FIRESTORE_HOST) {
    throw new Error("Firestore Emulator ist nicht eindeutig auf localhost festgelegt.");
  }
}

function createEmulatorAdminProvisioning(options = {}) {
  assertEmulatorIsolation();
  const app = getApps().find((candidate) => candidate.name === "phase3-admin-provisioning")
    || initializeApp({ projectId: DEMO_PROJECT_ID }, "phase3-admin-provisioning");
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  return {
    auth,
    firestore,
    fieldValue: FieldValue,
    service: createAdminProvisioningService({
      auth,
      firestore,
      fieldValue: FieldValue,
      hooks: options.hooks || {}
    })
  };
}

module.exports = {
  DEMO_PROJECT_ID,
  assertEmulatorIsolation,
  createEmulatorAdminProvisioning
};
