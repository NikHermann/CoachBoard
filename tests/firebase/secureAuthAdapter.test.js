import test from "node:test";
import assert from "node:assert/strict";
import {
  readProfile,
  readTokenClaims
} from "../../Backend/secureAuthAdapter.js";
import { SecureAuthError } from "../../Backend/secureAuthFlow.js";

test("Claims werden beim Profilabruf zwingend aus einem aktualisierten ID-Token gelesen", async () => {
  const user = { uid: "synthetic-auth-uid" };
  const calls = [];
  const claims = await readTokenClaims(user, async (...args) => {
    calls.push(args);
    return { claims: { role: "admin", profile_id: "different-profile-document" } };
  });

  assert.deepEqual(calls, [[user, true]]);
  assert.equal(claims.profile_id, "different-profile-document");
  assert.equal(claims.role, "admin");
});

test("Profilabruf verwendet die aus dem Claim abgeleitete Firestore-Dokument-ID", async () => {
  const requestedPaths = [];
  const profile = await readProfile("different-profile-document", {
    database: { name: "synthetic-db" },
    document: (database, collection, profileId) => {
      requestedPaths.push([database.name, collection, profileId]);
      return { collection, profileId };
    },
    getDocument: async () => ({
      exists: () => true,
      data: () => ({ uid: "synthetic-auth-uid", username: "Synthetic Admin" })
    })
  });

  assert.deepEqual(requestedPaths, [["synthetic-db", "users", "different-profile-document"]]);
  assert.equal(profile.uid, "synthetic-auth-uid");
});

test("Fehlendes Profil und Firestore-Berechtigungsfehler bleiben unterscheidbar", async () => {
  const dependencies = {
    database: {},
    document: () => ({})
  };

  await assert.rejects(
    () => readProfile("missing-profile", {
      ...dependencies,
      getDocument: async () => ({ exists: () => false })
    }),
    (error) => error instanceof SecureAuthError && error.code === "profile-missing"
  );

  await assert.rejects(
    () => readProfile("forbidden-profile", {
      ...dependencies,
      getDocument: async () => {
        throw Object.assign(new Error("denied"), { code: "permission-denied" });
      }
    }),
    (error) => error instanceof SecureAuthError && error.code === "profile-permission-denied"
  );

  await assert.rejects(
    () => readProfile("failed-profile", {
      ...dependencies,
      getDocument: async () => {
        throw Object.assign(new Error("offline"), { code: "unavailable" });
      }
    }),
    (error) => error instanceof SecureAuthError && error.code === "profile-read-failed"
  );
});
