export const LOCAL_AUTH_MODE_PARAMETER = "authMode";
export const LOCAL_AUTH_MODE_VALUE = "emulator";
export const LOCAL_AUTH_PROJECT_ID = "demo-coachboard-auth";
export const LOCAL_AUTH_HOST = "127.0.0.1";
export const LOCAL_AUTH_PORT = 9099;
export const LOCAL_FIRESTORE_HOST = "127.0.0.1";
export const LOCAL_FIRESTORE_PORT = 8080;

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function resolveLocalAuthTestMode(locationLike = globalThis.location) {
  if (!locationLike) return false;

  const params = new URLSearchParams(locationLike.search || "");
  const requested = params.get(LOCAL_AUTH_MODE_PARAMETER) === LOCAL_AUTH_MODE_VALUE;

  if (!requested) return false;

  if (!isLoopbackHost(locationLike.hostname)) {
    throw new Error("Der lokale Firebase-Auth-Testmodus ist ausschließlich auf localhost zulässig.");
  }

  if (locationLike.protocol !== "http:") {
    throw new Error("Der lokale Firebase-Auth-Testmodus erwartet einen lokalen HTTP-Entwicklungsserver.");
  }

  return true;
}

export const isLocalAuthTestMode = resolveLocalAuthTestMode();
