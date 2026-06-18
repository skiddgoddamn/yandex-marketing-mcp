import { test } from "node:test";
import assert from "node:assert/strict";
import { directExtraTools } from "../src/tools/directExtra.ts";

test("direct extra exposes 26 tools, none wordstat", () => {
  assert.equal(directExtraTools.length, 26);
  assert.ok(directExtraTools.every((t) => !t.name.startsWith("yd_wordstat")));
});
