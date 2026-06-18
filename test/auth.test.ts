import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

beforeEach(() => {
  process.env.YANDEX_MCP_CONFIG_DIR = mkdtempSync(join(tmpdir(), "ymcp-"));
  delete process.env.YD_OAUTH_TOKEN;
  delete process.env.YANDEX_OAUTH_CLIENT_ID;
  delete process.env.YC_FOLDER_ID;
});

test("env seed is used when no config file", async () => {
  process.env.YD_OAUTH_TOKEN = "envtok";
  const auth = await import(`../src/auth.ts?1`);
  auth.initAuth();
  assert.equal(auth.currentToken(), "envtok");
});

test("setClientId persists and buildAuthorizeUrl reflects it", async () => {
  const auth = await import(`../src/auth.ts?2`);
  auth.initAuth();
  assert.equal(auth.buildAuthorizeUrl(), null);
  auth.setClientId("my-client-id");
  assert.equal(auth.buildAuthorizeUrl(), "https://oauth.yandex.ru/authorize?response_type=token&client_id=my-client-id");
});

test("authRequiredPayload includes authorize_url when client_id set, omits otherwise", async () => {
  const auth = await import(`../src/auth.ts?3`);
  auth.initAuth();
  const p1 = auth.authRequiredPayload("none");
  assert.equal(p1.authorization_required, true);
  assert.equal("authorize_url" in p1, false);
  auth.setClientId("cid");
  const p2 = auth.authRequiredPayload("none");
  assert.equal(p2.authorize_url, "https://oauth.yandex.ru/authorize?response_type=token&client_id=cid");
});

test("in-memory set overrides file overrides env", async () => {
  process.env.YD_OAUTH_TOKEN = "envtok";
  const auth = await import(`../src/auth.ts?4`);
  auth.initAuth();
  auth.setToken("settok");
  assert.equal(auth.currentToken(), "settok");
});
