import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export interface StoredConfig {
  client_id?: string;
  oauth_token?: string;
  yc_folder_id?: string;
}

function configDir(): string {
  return process.env.YANDEX_MCP_CONFIG_DIR || join(homedir(), ".yandex-marketing-mcp");
}
function configPath(): string {
  return join(configDir(), "config.json");
}

export function loadConfig(): StoredConfig {
  try {
    const parsed = JSON.parse(readFileSync(configPath(), "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as StoredConfig) : {};
  } catch {
    return {};
  }
}

export function saveConfig(cfg: StoredConfig): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), "utf8");
}
