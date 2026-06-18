// test/scaffold.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { text } from "../src/types.ts";

test("text() wraps an object as pretty JSON content", () => {
  const r = text({ a: 1 });
  assert.equal(r.content[0].type, "text");
  assert.equal(r.content[0].text, '{\n  "a": 1\n}');
});

test("text() passes strings through unchanged", () => {
  assert.equal(text("hi").content[0].text, "hi");
});
