import test from "node:test";
import assert from "node:assert/strict";
import {
  PROJECT_ID,
  assertEmulatorSafety,
  assertLocalPort,
  installLocalNetworkGuard
} from "./emulatorSafety.js";

test("Emulatorumgebung ist fail-closed konfiguriert", async () => {
  assertEmulatorSafety();
  assert.match(PROJECT_ID, /^demo-/);
  await assertLocalPort("127.0.0.1", 9099);
  await assertLocalPort("127.0.0.1", 8080);
});

test("Netzwerkschutz blockiert externe Ziele", async () => {
  const restore = installLocalNetworkGuard();
  try {
    assert.throws(() => fetch("https://firestore.googleapis.com/"), /Externer Netzwerkzugriff/);
  } finally {
    restore();
  }
});
