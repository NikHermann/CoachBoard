import test from "node:test";
import assert from "node:assert/strict";
import {
  LOCAL_AUTH_PROJECT_ID,
  resolveLocalAuthTestMode
} from "../../Backend/localAuthTestMode.js";

test("lokaler Auth-Testmodus bleibt ohne ausdrücklichen Parameter deaktiviert", () => {
  assert.equal(resolveLocalAuthTestMode({
    search: "",
    hostname: "localhost",
    protocol: "http:"
  }), false);
});

test("lokaler Auth-Testmodus akzeptiert ausschließlich den Demo-Modus auf Loopback", () => {
  assert.equal(LOCAL_AUTH_PROJECT_ID, "demo-coachboard-auth");
  assert.equal(resolveLocalAuthTestMode({
    search: "?authMode=emulator",
    hostname: "127.0.0.1",
    protocol: "http:"
  }), true);
});

test("lokaler Auth-Testmodus verweigert nicht lokale Hosts und HTTPS", () => {
  assert.throws(() => resolveLocalAuthTestMode({
    search: "?authMode=emulator",
    hostname: "coachboarddb.web.app",
    protocol: "https:"
  }), /ausschließlich auf localhost/);

  assert.throws(() => resolveLocalAuthTestMode({
    search: "?authMode=emulator",
    hostname: "localhost",
    protocol: "https:"
  }), /lokalen HTTP-Entwicklungsserver/);
});
