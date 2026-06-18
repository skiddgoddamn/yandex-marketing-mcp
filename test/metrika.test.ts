// test/metrika.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { metrikaTools } from "../src/tools/metrika.ts";

test("metrika module exposes 43 tools, all yd_metrika_ prefixed", () => {
  assert.equal(metrikaTools.length, 43);
  assert.ok(metrikaTools.every((t) => t.name.startsWith("yd_metrika_")));
});

test("yd_metrika_report schema requires counter_id and metrics", () => {
  const t = metrikaTools.find((x) => x.name === "yd_metrika_report")!;
  assert.deepEqual(t.inputSchema.required, ["counter_id", "metrics"]);
});
