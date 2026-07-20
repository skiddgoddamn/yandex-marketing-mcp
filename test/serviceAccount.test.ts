// test/serviceAccount.test.ts — Yandex Cloud service-account auth for Wordstat.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync, verify as cryptoVerify, constants as cryptoConstants } from "node:crypto";

process.env.YANDEX_MCP_CONFIG_DIR = mkdtempSync(join(tmpdir(), "ymcp-sa-"));
delete process.env.YD_OAUTH_TOKEN;
delete process.env.YANDEX_OAUTH_CLIENT_ID;
delete process.env.YC_SA_ID;
delete process.env.YC_SA_KEY_ID;
delete process.env.YC_SA_PRIVATE_KEY;
delete process.env.YC_IAM_TOKEN;

const auth = await import("../src/auth.ts");
const api = await import("../src/yandexApi.ts");

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const KEY_FILE = JSON.stringify({
  id: "key-abc",
  service_account_id: "sa-xyz",
  created_at: "2026-07-20T10:00:00Z",
  key_algorithm: "RSA_2048",
  public_key: publicKey,
  private_key: privateKey,
});

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

beforeEach(() => {
  process.env.YANDEX_MCP_CONFIG_DIR = mkdtempSync(join(tmpdir(), "ymcp-sa-"));
  auth.initAuth();
  api.resetIamCache();
});

test("parseAuthorizedKey maps key id to kid and service_account_id to iss", () => {
  const sa = auth.parseAuthorizedKey(KEY_FILE);
  // The easiest bug to ship here is swapping these two.
  assert.equal(sa.id, "sa-xyz", "iss must be the service account id");
  assert.equal(sa.keyId, "key-abc", "kid must be the authorized key id");
  assert.ok(sa.privateKey.includes("PRIVATE KEY"));
});

test("parseAuthorizedKey rejects malformed input with an actionable message", () => {
  assert.throws(() => auth.parseAuthorizedKey("{nope"), /not valid JSON/);
  assert.throws(() => auth.parseAuthorizedKey(JSON.stringify({ id: "k" })), /service_account_id, private_key/);
  assert.throws(
    () => auth.parseAuthorizedKey(JSON.stringify({ id: "k", service_account_id: "s", private_key: "hunter2" })),
    /PEM block/,
  );
});

test("buildServiceAccountJwt produces a PS256 JWT Cloud will accept", () => {
  const sa = auth.parseAuthorizedKey(KEY_FILE);
  const now = 1_780_000_000;
  const jwt = api.buildServiceAccountJwt(sa, now);
  const [h, p, s] = jwt.split(".");

  assert.deepEqual(decode(h), { typ: "JWT", alg: "PS256", kid: "key-abc" });
  assert.deepEqual(decode(p), {
    iss: "sa-xyz",
    aud: "https://iam.api.cloud.yandex.net/iam/v1/tokens",
    iat: now,
    exp: now + 3600,
  });
  // Cloud rejects anything where exp - iat exceeds one hour.
  assert.ok(decode(p).exp - decode(p).iat <= 3600);

  const ok = cryptoVerify(
    "RSA-SHA256",
    Buffer.from(`${h}.${p}`),
    { key: publicKey, padding: cryptoConstants.RSA_PKCS1_PSS_PADDING, saltLength: cryptoConstants.RSA_PSS_SALTLEN_DIGEST },
    Buffer.from(s, "base64url"),
  );
  assert.ok(ok, "signature must verify under PSS padding");
});

test("getIamToken exchanges a JWT when a service account is configured", async () => {
  auth.setServiceAccount(auth.parseAuthorizedKey(KEY_FILE));
  let sentBody: any = null;
  const fetchImpl = async (_url: any, init: any) => {
    sentBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ iamToken: "iam-from-jwt", expiresAt: "2026-07-20T22:00:00Z" }), { status: 200 });
  };
  const tok = await api.getIamToken(fetchImpl as any);
  assert.equal(tok, "iam-from-jwt");
  assert.ok(sentBody.jwt, "must send the jwt field, not yandexPassportOauthToken");
  assert.equal(sentBody.yandexPassportOauthToken, undefined);
  assert.equal(api.iamSource(), "service_account");
});

test("service account wins over a stale OAuth token", async () => {
  auth.setToken("legacy-oauth");
  auth.setServiceAccount(auth.parseAuthorizedKey(KEY_FILE));
  let sentBody: any = null;
  const fetchImpl = async (_url: any, init: any) => {
    sentBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ iamToken: "iam-sa" }), { status: 200 });
  };
  await api.getIamToken(fetchImpl as any);
  assert.ok(sentBody.jwt);
  assert.equal(sentBody.yandexPassportOauthToken, undefined);
});

test("a static IAM token is returned without any network call", async () => {
  auth.setStaticIamToken("iam-pasted", 0);
  const fetchImpl = async () => { throw new Error("must not call the network"); };
  assert.equal(await api.getIamToken(fetchImpl as any), "iam-pasted");
  assert.equal(api.iamSource(), "static_token");
});

test("an expired static IAM token fails with instructions instead of a 401", async () => {
  auth.setStaticIamToken("iam-old", Math.floor(Date.now() / 1000) - 10);
  await assert.rejects(
    () => api.getIamToken((async () => { throw new Error("no network"); }) as any),
    /expired.*yc iam create-token/s,
  );
});

test("the post-2026-06-01 OAuth rejection is reported as an auth error with the fix", async () => {
  auth.setToken("token-issued-too-late");
  const fetchImpl = async () =>
    new Response(JSON.stringify({
      code: 3,
      message: "OAuth token for user 'aje75otbgjuj7qe5bgr9', issued after '2026-06-01', is not supported for IAM token exchange",
    }), { status: 400 });
  await assert.rejects(
    () => api.getIamToken(fetchImpl as any),
    (e: any) => e.name === "AuthError" && /yd_set_service_account/.test(e.message),
  );
});

test("no credential at all names the service-account path", async () => {
  await assert.rejects(
    () => api.getIamToken((async () => { throw new Error("no network"); }) as any),
    /No IAM credential configured/,
  );
  assert.equal(api.iamSource(), "none");
});

test("the IAM token is cached per credential and refetched when it changes", async () => {
  auth.setServiceAccount(auth.parseAuthorizedKey(KEY_FILE));
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return new Response(JSON.stringify({ iamToken: `iam-${calls}`, expiresAt: "2026-07-20T22:00:00Z" }), { status: 200 });
  };
  assert.equal(await api.getIamToken(fetchImpl as any), "iam-1");
  assert.equal(await api.getIamToken(fetchImpl as any), "iam-1", "second call must hit the cache");
  assert.equal(calls, 1);

  // Rotating the key must invalidate the cache without an explicit reset.
  auth.setServiceAccount({ id: "sa-other", keyId: "key-other", privateKey });
  assert.equal(await api.getIamToken(fetchImpl as any), "iam-2");
  assert.equal(calls, 2);
});

test("yd_set_service_account stores the key and reports the missing folder", async () => {
  const res = await auth.authHandlers["yd_set_service_account"]({ key_json: KEY_FILE }, { clientLogin: "" });
  const out = JSON.parse(res.content[0].text);
  assert.equal(out.ok, true);
  assert.equal(out.service_account_id, "sa-xyz");
  assert.equal(out.key_id, "key-abc");
  assert.equal(out.folder_id_set, false);
  assert.match(out.next_step, /yc_folder_id/);
  assert.equal(auth.currentServiceAccount()?.id, "sa-xyz");
});

test("yd_set_service_account accepts a folder id and survives a later yd_set_token", async () => {
  await auth.authHandlers["yd_set_service_account"]({ key_json: KEY_FILE, yc_folder_id: "b1gfolder" }, { clientLogin: "" });
  auth.setValidator(async () => true);
  await auth.authHandlers["yd_set_token"]({ oauth_token: "fresh" }, { clientLogin: "" });

  // persist() enumerates fields explicitly — a missed field would silently wipe the key here.
  auth.initAuth();
  assert.equal(auth.currentServiceAccount()?.id, "sa-xyz");
  assert.equal(auth.currentFolderId(), "b1gfolder");
  assert.equal(auth.currentToken(), "fresh");
});

test("yd_auth_status separates Wordstat readiness from OAuth validity", async () => {
  auth.setValidator(async () => true);
  auth.setToken("oauth-good");
  let out = JSON.parse((await auth.authHandlers["yd_auth_status"]({}, { clientLogin: "" })).content[0].text);
  // The original bug: a valid Direct/Metrika token read as "Wordstat is configured".
  assert.equal(out.token_valid, true);
  assert.equal(out.wordstat_ready, false);
  assert.match(out.wordstat_iam_source, /oauth/);

  await auth.authHandlers["yd_set_service_account"]({ key_json: KEY_FILE, yc_folder_id: "b1gfolder" }, { clientLogin: "" });
  out = JSON.parse((await auth.authHandlers["yd_auth_status"]({}, { clientLogin: "" })).content[0].text);
  assert.equal(out.wordstat_ready, true);
  assert.equal(out.wordstat_iam_source, "service_account");
});

test("yd_set_iam_token rejects an unparseable expiry rather than storing it", async () => {
  const res = await auth.authHandlers["yd_set_iam_token"]({ iam_token: "t", expires_at: "next tuesday" }, { clientLogin: "" });
  const out = JSON.parse(res.content[0].text);
  assert.match(out.error, /ISO-8601/);
  assert.equal(auth.currentStaticIam(), null);
});
