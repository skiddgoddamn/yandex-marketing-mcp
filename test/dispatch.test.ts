// test/dispatch.test.ts
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

beforeEach(() => {
  process.env.YANDEX_MCP_CONFIG_DIR = mkdtempSync(join(tmpdir(), "ymcp-"));
  delete process.env.YD_OAUTH_TOKEN; delete process.env.YANDEX_OAUTH_CLIENT_ID;
  delete process.env.YD_READONLY; delete process.env.YD_CONFIRM;
});

test("classification: mutating vs read, direct vs metrika, auth tools non-mutating", async () => {
  const idx = await import(`../src/index.ts?d1`);
  assert.equal(idx.isMutating("yd_campaigns_add"), true);
  assert.equal(idx.isMutating("yd_metrika_goal_delete"), true);
  assert.equal(idx.isMutating("yd_campaigns_get"), false);
  assert.equal(idx.isMutating("yd_set_token"), false); // auth tool exempt
  assert.equal(idx.isDirect("yd_campaigns_add"), true);
  assert.equal(idx.isDirect("yd_metrika_report"), false);
  assert.equal(idx.isDirect("yd_wordstat_regions"), false);
});

test("auth-gate: data tool with no token returns authorization_required", async () => {
  const idx = await import(`../src/index.ts?d2`);
  const res = await idx.dispatch("yd_metrika_counters_get", {});
  const out = JSON.parse(res.content[0].text);
  assert.equal(out.authorization_required, true);
});

test("auth-gate: auth tools work without a token", async () => {
  const idx = await import(`../src/index.ts?d3`);
  const res = await idx.dispatch("yd_auth_status", {});
  const out = JSON.parse(res.content[0].text);
  assert.equal(out.token_set, false);
});

test("READONLY blocks a mutating tool", async () => {
  process.env.YD_READONLY = "true";
  process.env.YD_OAUTH_TOKEN = "tok";
  const idx = await import(`../src/index.ts?d4`);
  const res = await idx.dispatch("yd_campaigns_add", { name: "x", start_date: "2026-01-01" });
  const out = JSON.parse(res.content[0].text);
  assert.equal(out.denied, true);
});

test("isMutating: webmaster _start and _submit are mutating; _get is not", async () => {
  const idx = await import(`../src/index.ts?d5`);
  assert.equal(idx.isMutating("yd_webmaster_verification_start"), true);
  assert.equal(idx.isMutating("yd_webmaster_recrawl_submit"), true);
  assert.equal(idx.isMutating("yd_webmaster_hosts_get"), false);
});

test("YD_ALLOWED_LOGINS: denied for non-whitelisted login, not denied for whitelisted or absent login", async () => {
  process.env.YD_ALLOWED_LOGINS = "agency1";
  process.env.YD_OAUTH_TOKEN = "tok";
  const idx = await import(`../src/index.ts?d6`);

  // Non-whitelisted login → denied
  const res1 = await idx.dispatch("yd_campaigns_get", { client_login: "other" });
  const out1 = JSON.parse(res1.content[0].text);
  assert.equal(out1.denied, true, "Expected denied for non-whitelisted client_login");

  // Whitelisted login → NOT denied (may fail at network/handler, but no denied:true)
  const res2 = await idx.dispatch("yd_campaigns_get", { client_login: "agency1" });
  const out2 = JSON.parse(res2.content[0].text);
  assert.ok(out2.denied !== true, "Expected allowed for whitelisted client_login");

  // No client_login → whitelist bypass (not denied)
  const res3 = await idx.dispatch("yd_campaigns_get", {});
  const out3 = JSON.parse(res3.content[0].text);
  assert.ok(out3.denied !== true, "Expected no deny when client_login is absent");

  delete process.env.YD_ALLOWED_LOGINS;
});
