import test from "node:test";
import assert from "node:assert/strict";
import { AVATAR_MAX_STORED_BYTES, getAvatarDataBytes, isValidAvatarData } from "../../Backend/avatarUtils.js";

test("Avatar-Datenprüfung akzeptiert ausschließlich kleine JPEG- und WebP-Data-URLs", () => {
  const exact = `data:image/jpeg;base64,${Buffer.alloc(AVATAR_MAX_STORED_BYTES, 1).toString("base64")}`;
  const oversized = `data:image/webp;base64,${Buffer.alloc(AVATAR_MAX_STORED_BYTES + 1, 1).toString("base64")}`;
  assert.equal(getAvatarDataBytes(exact), AVATAR_MAX_STORED_BYTES);
  assert.equal(isValidAvatarData(exact), true);
  assert.equal(isValidAvatarData(oversized), false);
  assert.equal(isValidAvatarData("data:image/png;base64,AQID"), false);
  assert.equal(isValidAvatarData("data:image/svg+xml;base64,PHN2Zz4="), false);
  assert.equal(isValidAvatarData("https://example.invalid/avatar.webp"), false);
});
