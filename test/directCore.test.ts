// test/directCore.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { directCoreTools } from "../src/tools/directCore.ts";
import { rublesToMicros } from "../src/yandexApi.ts";

test("direct core exposes 46 tools, none wordstat", () => {
  assert.equal(directCoreTools.length, 46);
  assert.ok(directCoreTools.every((t) => !t.name.startsWith("yd_wordstat")));
});

test("rublesToMicros converts correctly", () => {
  assert.equal(rublesToMicros(500), 500_000_000);
});
