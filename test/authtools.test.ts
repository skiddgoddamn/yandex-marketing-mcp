import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

beforeEach(() => {
  process.env.YANDEX_MCP_CONFIG_DIR = mkdtempSync(join(tmpdir(), "ymcp-"));
  delete process.env.YD_OAUTH_TOKEN; delete process.env.YANDEX_OAUTH_CLIENT_ID;
});

test("yd_set_client_id returns the authorize url", async () => {
  const auth = await import(`../src/auth.ts?t1`);
  auth.initAuth();
  const res = await auth.authHandlers["yd_set_client_id"]({ client_id: "abc" }, { clientLogin: "" });
  const out = JSON.parse(res.content[0].text);
  assert.equal(out.authorize_url, "https://oauth.yandex.ru/authorize?response_type=token&client_id=abc");
  assert.equal(auth.currentClientId(), "abc");
});

test("yd_set_token validates and persists on success", async () => {
  const auth = await import(`../src/auth.ts?t2`);
  auth.initAuth();
  auth.setValidator(async () => true);
  const res = await auth.authHandlers["yd_set_token"]({ oauth_token: "good" }, { clientLogin: "" });
  assert.match(res.content[0].text, /success|saved|ok/i);
  assert.equal(auth.currentToken(), "good");
});

test("yd_set_token rejects an invalid token without persisting", async () => {
  const auth = await import(`../src/auth.ts?t3`);
  auth.initAuth();
  auth.setValidator(async () => false);
  const res = await auth.authHandlers["yd_set_token"]({ oauth_token: "bad" }, { clientLogin: "" });
  assert.match(res.content[0].text, /invalid|rejected|failed/i);
  assert.equal(auth.currentToken(), "");
});

test("yd_auth_status reports presence flags", async () => {
  const auth = await import(`../src/auth.ts?t4`);
  auth.initAuth();
  const res = await auth.authHandlers["yd_auth_status"]({}, { clientLogin: "" });
  const out = JSON.parse(res.content[0].text);
  assert.equal(out.client_id_set, false);
  assert.equal(out.token_set, false);
});
