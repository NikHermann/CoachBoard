import test from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCTION_AUTH_ENABLED,
  resolveProductionAuthMode
} from "../../Backend/productionAuthMode.js";

test("produktiver Auth-Modus ist im Release ausschließlich auf der Vereinsdomain aktiv", () => {
  assert.equal(PRODUCTION_AUTH_ENABLED, true);
  assert.equal(resolveProductionAuthMode({
    protocol: "https:",
    hostname: "tsv-trainingsplatz.at",
    search: "?authMode=production"
  }), true);
});

test("URL-Parameter und fremde Hosts können den Produktionsmodus nicht aktivieren", () => {
  for (const locationLike of [
    { protocol: "https:", hostname: "evil.example", search: "?authMode=emulator" },
    { protocol: "http:", hostname: "tsv-trainingsplatz.at", search: "?authMode=production" },
    { protocol: "http:", hostname: "localhost", search: "?authMode=production" }
  ]) {
    assert.equal(resolveProductionAuthMode(locationLike), false);
  }
});

test("die Release-Freigabe bleibt auf HTTPS und die Vereinsdomain begrenzt", () => {
  assert.equal(resolveProductionAuthMode({
    protocol: "https:",
    hostname: "tsv-trainingsplatz.at"
  }, true), true);
  assert.equal(resolveProductionAuthMode({
    protocol: "https:",
    hostname: "www.tsv-trainingsplatz.at"
  }, true), true);
  assert.equal(resolveProductionAuthMode({
    protocol: "https:",
    hostname: "coachboarddb.web.app"
  }, true), false);
  assert.equal(resolveProductionAuthMode({
    protocol: "http:",
    hostname: "tsv-trainingsplatz.at"
  }, true), false);
});
