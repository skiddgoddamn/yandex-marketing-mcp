// test/yandexApi.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { annotatePartial, iamExpiry, requestWithRetry } from "../src/yandexApi.ts";

test("annotatePartial flags per-item errors and warnings", () => {
  const out = annotatePartial({ result: { AddResults: [
    { Id: 1 },
    { Errors: [{ Code: 5, Message: "Bad" }] },
    { Warnings: [{ Code: 9, Message: "Trunc" }] },
  ] } });
  assert.equal(out._partial_success.ok, false);
  assert.equal(out._partial_success.error_count, 1);
  assert.equal(out._partial_success.warning_count, 1);
});

test("annotatePartial leaves clean results untouched", () => {
  const out = annotatePartial({ result: { AddResults: [{ Id: 1 }] } });
  assert.equal("_partial_success" in out, false);
});

test("iamExpiry parses ISO Z minus 60s and falls back to 11h", () => {
  // 2026-05-30T13:00:00Z == 1780146000
  assert.ok(Math.abs(iamExpiry({ expiresAt: "2026-05-30T13:00:00Z" }, 0) - (1780146000 - 60)) < 2);
  assert.equal(iamExpiry({}, 1000), 1000 + 11 * 3600);
});

test("requestWithRetry retries on 503 then succeeds", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return new Response(calls < 2 ? "busy" : "ok", { status: calls < 2 ? 503 : 200 });
  };
  const resp = await requestWithRetry("http://x", { method: "POST" }, { fetchImpl, sleep: async () => {} });
  assert.equal(resp.status, 200);
  assert.equal(calls, 2);
});
