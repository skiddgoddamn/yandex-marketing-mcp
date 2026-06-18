// test/wordstat.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { wordstatTools } from "../src/tools/wordstat.ts";

test("wordstat exposes 5 tools", () => {
  assert.equal(wordstatTools.length, 5);
  assert.ok(wordstatTools.every((t) => t.name.startsWith("yd_wordstat_")));
});
