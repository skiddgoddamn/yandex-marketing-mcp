import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ymcp-")); process.env.YANDEX_MCP_CONFIG_DIR = dir; });

test("loadConfig returns {} when file is absent", async () => {
  const { loadConfig } = await import("../src/config.ts");
  assert.deepEqual(loadConfig(), {});
});

test("loadConfig returns {} on corrupt JSON", async () => {
  writeFileSync(join(dir, "config.json"), "{not json");
  const { loadConfig } = await import("../src/config.ts");
  assert.deepEqual(loadConfig(), {});
});

test("saveConfig then loadConfig round-trips", async () => {
  const { loadConfig, saveConfig } = await import("../src/config.ts");
  saveConfig({ client_id: "cid", oauth_token: "tok" });
  assert.deepEqual(loadConfig(), { client_id: "cid", oauth_token: "tok" });
  rmSync(dir, { recursive: true, force: true });
});
