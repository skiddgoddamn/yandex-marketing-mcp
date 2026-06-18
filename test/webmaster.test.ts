// test/webmaster.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { webmasterTools, webmasterHandlers } from "../src/tools/webmaster.ts";
import { getWebmasterUserId, webmasterFetch, resetWebmasterCache } from "../src/yandexApi.ts";

// ── Tool registration checks ─────────────────────────────────────────────────

test("webmaster: 30 tools registered", () => {
  assert.equal(webmasterTools.length, 30);
});

test("webmaster: all tool names start with yd_webmaster_", () => {
  for (const t of webmasterTools) {
    assert.ok(t.name.startsWith("yd_webmaster_"), `Bad name: ${t.name}`);
  }
});

test("webmaster: every tool has a handler", () => {
  for (const t of webmasterTools) {
    assert.ok(typeof webmasterHandlers[t.name] === "function", `Missing handler: ${t.name}`);
  }
});

// ── isDirect classification check ────────────────────────────────────────────

test("dispatch: isDirect(yd_webmaster_hosts_get) === false", async () => {
  const { isDirect } = await import("../src/index.ts");
  assert.equal(isDirect("yd_webmaster_hosts_get"), false);
});

// ── Offline webmasterFetch unit tests ─────────────────────────────────────────

function makeFakeAuth(userId: string) {
  // Patch currentToken to return a stable value
  // We test via webmasterFetch with injected fetchImpl only
  const calls: Array<{ url: string; init: RequestInit }> = [];

  const fakeFetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    calls.push({ url, init: init ?? {} });

    if (url.endsWith("/v4/user/")) {
      return new Response(JSON.stringify({ user_id: Number(userId) }), { status: 200 });
    }
    // All other calls return a dummy result
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  return { fakeFetch, calls };
}

test("webmasterFetch: first call resolves user_id via /v4/user/, second uses cache", async () => {
  // Reset cache so this test is self-contained regardless of execution order.
  resetWebmasterCache();

  const { calls, fakeFetch } = makeFakeAuth("42");

  // Cold cache — must hit /v4/user/ first then the resource.
  await webmasterFetch("get", "/hosts/", {}, fakeFetch);

  assert.ok(calls.length >= 2, `Expected at least 2 fetch calls on cold cache, got ${calls.length}`);
  assert.ok(calls[0].url.includes("/v4/user/"), `First call should hit /v4/user/, got: ${calls[0].url}`);
  assert.ok(calls[1].url.includes("/v4/user/") && calls[1].url.includes("/hosts/"),
    `Second call should include user_id and /hosts/, got: ${calls[1].url}`);

  // Warm cache — second call should skip /user/ entirely.
  const calls2: Array<{ url: string }> = [];
  const fakeFetch2: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    calls2.push({ url });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  await webmasterFetch("get", "/hosts/", {}, fakeFetch2);

  assert.equal(calls2.length, 1, `Expected 1 call (cache hit), got ${calls2.length}`);
  assert.ok(!calls2[0].url.endsWith("/v4/user/"), "Cached call should not hit /user/");
  assert.ok(calls2[0].url.includes("/hosts/"), `Should hit /hosts/, got: ${calls2[0].url}`);
});

test("webmasterFetch: array param query_indicator produces repeated query params", async () => {
  const calls: Array<{ url: string }> = [];
  const fakeFetch: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    calls.push({ url });
    if (url.endsWith("/v4/user/")) {
      return new Response(JSON.stringify({ user_id: 99 }), { status: 200 });
    }
    return new Response(JSON.stringify({ queries: [] }), { status: 200 });
  };

  await webmasterFetch(
    "get",
    "/hosts/example.com/search-queries/popular/",
    { params: { query_indicator: ["TOTAL_SHOWS", "CTR"] } },
    fakeFetch,
  );

  // Find the call that hits the search-queries endpoint
  const queryCall = calls.find((c) => c.url.includes("search-queries"));
  assert.ok(queryCall, "Should have made a call to search-queries endpoint");

  const urlObj = new URL(queryCall!.url);
  const indicators = urlObj.searchParams.getAll("query_indicator");
  assert.deepEqual(indicators, ["TOTAL_SHOWS", "CTR"],
    `Expected repeated query_indicator params, got: ${JSON.stringify(indicators)}`);
});

test("webmasterFetch: 204 response returns {success:true}", async () => {
  const fakeFetch: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.endsWith("/v4/user/")) return new Response(JSON.stringify({ user_id: 1 }), { status: 200 });
    return new Response(null, { status: 204 });
  };

  const result = await webmasterFetch("delete", "/hosts/foo/", {}, fakeFetch);
  assert.deepEqual(result, { success: true });
});
