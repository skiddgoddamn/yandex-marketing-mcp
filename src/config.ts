import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export interface StoredConfig {
  client_id?: string;
  oauth_token?: string;
  yc_folder_id?: string;
  /** Yandex Cloud service account: authorized key fields (yc iam key create -o key.json). */
  yc_sa_id?: string;
  yc_sa_key_id?: string;
  yc_sa_private_key?: string;
  /** Pre-issued IAM token (yc iam create-token) — stopgap, lives at most 12h. */
  yc_iam_token?: string;
  yc_iam_expires_at?: number;
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
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  // 0600: the file holds an OAuth token and a service-account private key.
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), { encoding: "utf8", mode: 0o600 });
}
