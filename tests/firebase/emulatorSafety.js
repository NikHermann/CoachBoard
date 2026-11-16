import net from "node:net";
import assert from "node:assert/strict";

export const PROJECT_ID = "demo-coachboard-auth";
export const AUTH_EMULATOR_HOST = "127.0.0.1:9099";
export const FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

export function assertEmulatorSafety() {
  assert.match(PROJECT_ID, /^demo-/, "Die Test-Projektkennung muss mit demo- beginnen.");
  assert.equal(
    process.env.FIREBASE_AUTH_EMULATOR_HOST,
    AUTH_EMULATOR_HOST,
    "Der Authentication Emulator ist nicht eindeutig konfiguriert."
  );
  assert.equal(
    process.env.FIRESTORE_EMULATOR_HOST,
    FIRESTORE_EMULATOR_HOST,
    "Der Firestore Emulator ist nicht eindeutig konfiguriert."
  );

  const cliProject = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  assert.equal(cliProject, PROJECT_ID, "Firebase CLI verwendet nicht das freigegebene Demo-Projekt.");
}

export function installLocalNetworkGuard() {
  const originalFetch = globalThis.fetch;
  assert.equal(typeof originalFetch, "function", "Die Fetch-API ist nicht verfügbar.");

  globalThis.fetch = (input, init) => {
    const rawUrl = input instanceof URL
      ? input.href
      : typeof input === "string"
        ? input
        : input?.url;
    const url = new URL(rawUrl);

    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
      throw new Error(`Externer Netzwerkzugriff im Firebase-Test blockiert: ${url.hostname}`);
    }

    return originalFetch(input, init);
  };

  return () => {
    globalThis.fetch = originalFetch;
  };
}

export function assertLocalPort(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Emulator nicht erreichbar: ${host}:${port}`));
    }, 2000);

    socket.once("connect", () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Emulator nicht erreichbar: ${host}:${port}`, { cause: error }));
    });
  });
}
