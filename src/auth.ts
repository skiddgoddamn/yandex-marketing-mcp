import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadConfig, saveConfig, type StoredConfig } from "./config.js";
import { text } from "./types.js";
import type { ToolDef, Handler } from "./types.js";

export class AuthError extends Error {
  constructor(message = "Yandex OAuth token is missing, invalid, or expired") {
    super(message);
    this.name = "AuthError";
  }
}

export const REQUIRED_SCOPES = ["direct:api", "metrika:read", "metrika:write", "cloud:auth", "webmaster:hostview", "webmaster:verify"];
export const REGISTER_APP_URL = "https://oauth.yandex.ru/client/new";

let state: StoredConfig = {};

export function initAuth(): void {
  const file = loadConfig();
  state = {
    client_id: file.client_id ?? process.env.YANDEX_OAUTH_CLIENT_ID ?? "",
    oauth_token: file.oauth_token ?? process.env.YD_OAUTH_TOKEN ?? "",
    yc_folder_id: file.yc_folder_id ?? process.env.YC_FOLDER_ID ?? "",
    yc_sa_id: file.yc_sa_id ?? process.env.YC_SA_ID ?? "",
    yc_sa_key_id: file.yc_sa_key_id ?? process.env.YC_SA_KEY_ID ?? "",
    yc_sa_private_key: file.yc_sa_private_key ?? process.env.YC_SA_PRIVATE_KEY ?? "",
    yc_iam_token: file.yc_iam_token ?? process.env.YC_IAM_TOKEN ?? "",
    yc_iam_expires_at: file.yc_iam_expires_at ?? 0,
  };
}

export function currentToken(): string { return state.oauth_token ?? ""; }
export function currentClientId(): string { return state.client_id ?? ""; }
export function currentFolderId(): string { return state.yc_folder_id ?? ""; }

export interface ServiceAccountKey { id: string; keyId: string; privateKey: string; }

/** Authorized key of a Yandex Cloud service account, or null when not configured. */
export function currentServiceAccount(): ServiceAccountKey | null {
  const id = state.yc_sa_id ?? "";
  const keyId = state.yc_sa_key_id ?? "";
  const privateKey = state.yc_sa_private_key ?? "";
  return id && keyId && privateKey ? { id, keyId, privateKey } : null;
}

/** Manually supplied IAM token (stopgap path), or null. */
export function currentStaticIam(): { token: string; expiresAt: number } | null {
  const token = state.yc_iam_token ?? "";
  return token ? { token, expiresAt: state.yc_iam_expires_at ?? 0 } : null;
}

function persist(): void {
  saveConfig({
    client_id: state.client_id || undefined,
    oauth_token: state.oauth_token || undefined,
    yc_folder_id: state.yc_folder_id || undefined,
    yc_sa_id: state.yc_sa_id || undefined,
    yc_sa_key_id: state.yc_sa_key_id || undefined,
    yc_sa_private_key: state.yc_sa_private_key || undefined,
    yc_iam_token: state.yc_iam_token || undefined,
    yc_iam_expires_at: state.yc_iam_expires_at || undefined,
  });
}

export function setClientId(id: string): void { state.client_id = id; persist(); }
export function setToken(t: string): void { state.oauth_token = t; persist(); }
export function setFolderId(f: string): void { state.yc_folder_id = f; persist(); }

export function setServiceAccount(sa: ServiceAccountKey): void {
  state.yc_sa_id = sa.id;
  state.yc_sa_key_id = sa.keyId;
  state.yc_sa_private_key = sa.privateKey;
  persist();
}

export function setStaticIamToken(token: string, expiresAt = 0): void {
  state.yc_iam_token = token;
  state.yc_iam_expires_at = expiresAt;
  persist();
}

/**
 * Parse the JSON produced by `yc iam key create -o key.json`.
 * Throws with an actionable message rather than returning a half-filled object.
 */
export function parseAuthorizedKey(raw: string): ServiceAccountKey {
  let json: any;
  try { json = JSON.parse(raw); }
  catch { throw new Error("Authorized key is not valid JSON. Expected the file produced by `yc iam key create -o key.json`."); }
  const id = String(json.id ?? "").trim();
  const serviceAccountId = String(json.service_account_id ?? json.serviceAccountId ?? "").trim();
  const privateKey = String(json.private_key ?? json.privateKey ?? "").trim();
  const missing = [
    !id && "id",
    !serviceAccountId && "service_account_id",
    !privateKey && "private_key",
  ].filter(Boolean);
  if (missing.length) throw new Error(`Authorized key is missing field(s): ${missing.join(", ")}.`);
  if (!privateKey.includes("PRIVATE KEY")) throw new Error("private_key does not look like a PEM block.");
  // `id` in the key file is the KEY id (JWT `kid`); `service_account_id` is the account (JWT `iss`).
  return { id: serviceAccountId, keyId: id, privateKey };
}

export function buildAuthorizeUrl(): string | null {
  const id = currentClientId();
  if (!id) return null;
  return `https://oauth.yandex.ru/authorize?response_type=token&client_id=${encodeURIComponent(id)}`;
}

export function authRequiredPayload(reason: string): Record<string, unknown> {
  const url = buildAuthorizeUrl();
  const payload: Record<string, unknown> = {
    authorization_required: true,
    reason,
    register_app_url: REGISTER_APP_URL,
    required_scopes: REQUIRED_SCOPES,
  };
  if (url) {
    payload.authorize_url = url;
    payload.next_step =
      "Open authorize_url, approve access, copy access_token from the redirect page, then call yd_set_token with it.";
  } else {
    payload.next_step =
      `Register a Yandex OAuth app at ${REGISTER_APP_URL} with the required scopes, then call yd_set_client_id with its client_id.`;
  }
  return payload;
}

export async function validateToken(token: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const resp = await fetchImpl("https://api-metrika.yandex.net/management/v1/counters?per_page=1", {
    headers: { Authorization: `OAuth ${token}` },
  });
  if (resp.status === 200) return true;
  if (resp.status === 401 || resp.status === 403) return false;
  throw new Error(`Could not verify token (HTTP ${resp.status})`);
}

let validator: (token: string) => Promise<boolean> = (t) => validateToken(t);
export function setValidator(fn: (token: string) => Promise<boolean>): void { validator = fn; }

export const AUTH_TOOLS: ToolDef[] = [
  {
    name: "yd_auth_status",
    description: "Show Yandex auth status: whether client_id, OAuth token, and Wordstat folder_id are configured.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "yd_set_client_id",
    description:
      "Save the Yandex OAuth application client_id and return the authorization link. Register an app at https://oauth.yandex.ru/client/new with scopes direct:api, metrika:read, metrika:write, cloud:auth and redirect 'Подставить URL для разработки'.",
    inputSchema: {
      type: "object",
      properties: { client_id: { type: "string", description: "Client ID of your Yandex OAuth app" } },
      required: ["client_id"],
    },
  },
  {
    name: "yd_set_token",
    description:
      "Save the Yandex OAuth access_token (obtained via the authorize link). Validated against the Metrika API before saving. Optionally set yc_folder_id for Wordstat.",
    inputSchema: {
      type: "object",
      properties: {
        oauth_token: { type: "string", description: "OAuth access_token from the verification page" },
        yc_folder_id: { type: "string", description: "Yandex Cloud folder ID for Wordstat (optional)" },
      },
      required: ["oauth_token"],
    },
  },
  {
    name: "yd_set_service_account",
    description:
      "Configure a Yandex Cloud service account for Wordstat (required since 2026-06-01, when Cloud stopped exchanging new OAuth tokens for IAM tokens). " +
      "Create the key with `yc iam key create --service-account-name <name> -o key.json`, then pass either key_file (path to that JSON) or key_json (its contents). " +
      "Also set yc_folder_id — Wordstat requires it.",
    inputSchema: {
      type: "object",
      properties: {
        key_file: { type: "string", description: "Path to the authorized key JSON from `yc iam key create` (~ is expanded)" },
        key_json: { type: "string", description: "Contents of the authorized key JSON, if you'd rather paste it than point at a file" },
        yc_folder_id: { type: "string", description: "Yandex Cloud folder ID for Wordstat (optional here, but required for calls)" },
      },
    },
  },
  {
    name: "yd_set_iam_token",
    description:
      "Stopgap: store a ready-made IAM token from `yc iam create-token`. Valid at most 12 hours — use yd_set_service_account for a permanent fix.",
    inputSchema: {
      type: "object",
      properties: {
        iam_token: { type: "string", description: "IAM token from `yc iam create-token`" },
        expires_at: { type: "string", description: "Optional ISO-8601 expiry; without it the token is used until the API rejects it" },
        yc_folder_id: { type: "string", description: "Yandex Cloud folder ID for Wordstat (optional)" },
      },
      required: ["iam_token"],
    },
  },
];

export const authHandlers: Record<string, Handler> = {
  async yd_auth_status() {
    const token = currentToken();
    let tokenValid: boolean | "unknown" = "unknown";
    if (token) { try { tokenValid = await validator(token); } catch { tokenValid = "unknown"; } }

    const sa = currentServiceAccount();
    const stat = currentStaticIam();
    const folderSet = Boolean(currentFolderId());
    // token_valid covers Direct/Metrika/Webmaster only. Wordstat goes through Cloud IAM,
    // which since 2026-06-01 refuses OAuth tokens issued on/after that date — so it is reported separately.
    const wordstatReady = (Boolean(sa) || Boolean(stat)) && folderSet;
    let wordstatHint: string;
    if (!folderSet) {
      wordstatHint = "yc_folder_id is not set — Wordstat calls will fail. Get it with `yc resource-manager folder list`.";
    } else if (sa) {
      wordstatHint = "Service account configured — IAM tokens are issued via JWT and renew automatically.";
    } else if (stat) {
      wordstatHint = "Using a manually supplied IAM token (max 12h). Prefer yd_set_service_account for a permanent fix.";
    } else {
      wordstatHint = "No Cloud credential. OAuth tokens issued on/after 2026-06-01 cannot be exchanged for IAM tokens — run yd_set_service_account.";
    }

    return text({
      client_id_set: Boolean(currentClientId()),
      token_set: Boolean(token),
      token_valid: tokenValid,
      token_valid_covers: "direct, metrika, webmaster (NOT wordstat)",
      folder_id_set: folderSet,
      wordstat_ready: wordstatReady,
      wordstat_iam_source: sa ? "service_account" : stat ? "static_token" : token ? "oauth (legacy, likely blocked)" : "none",
      wordstat_hint: wordstatHint,
      authorize_url: buildAuthorizeUrl(),
      hint: token
        ? "Configured. If calls fail with authorization_required, the token is likely expired — re-run yd_set_client_id → authorize → yd_set_token."
        : (currentClientId() ? "Open authorize_url, then call yd_set_token." : "Call yd_set_client_id with your app's client_id first."),
    });
  },
  async yd_set_service_account(args) {
    const keyFile = String(args.key_file ?? "").trim();
    const keyJson = String(args.key_json ?? "").trim();
    if (!keyFile && !keyJson) return text({ error: "Pass key_file (path to the JSON from `yc iam key create`) or key_json (its contents)." });
    let raw = keyJson;
    if (!raw) {
      const resolved = keyFile.startsWith("~") ? join(homedir(), keyFile.slice(1)) : keyFile;
      try { raw = readFileSync(resolved, "utf8"); }
      catch (e) { return text({ error: `Could not read ${resolved}: ${e instanceof Error ? e.message : String(e)}` }); }
    }
    let sa: ServiceAccountKey;
    try { sa = parseAuthorizedKey(raw); }
    catch (e) { return text({ error: e instanceof Error ? e.message : String(e) }); }
    setServiceAccount(sa);
    const folder = String(args.yc_folder_id ?? "").trim();
    if (folder) setFolderId(folder);
    return text({
      ok: true,
      service_account_id: sa.id,
      key_id: sa.keyId,
      folder_id_set: Boolean(currentFolderId()),
      next_step: currentFolderId()
        ? "Verify with yd_wordstat_regions_tree (no quota cost)."
        : "Set yc_folder_id — Wordstat calls need it. Get it with `yc resource-manager folder list`.",
    });
  },
  async yd_set_iam_token(args) {
    const tok = String(args.iam_token ?? "").trim();
    if (!tok) return text({ error: "iam_token is required" });
    let expiresAt = 0;
    const rawExpiry = String(args.expires_at ?? "").trim();
    if (rawExpiry) {
      const ms = Date.parse(rawExpiry);
      if (Number.isNaN(ms)) return text({ error: `Could not parse expires_at: ${rawExpiry}. Use ISO-8601, e.g. 2026-07-21T09:00:00Z.` });
      expiresAt = Math.floor(ms / 1000);
    }
    setStaticIamToken(tok, expiresAt);
    const folder = String(args.yc_folder_id ?? "").trim();
    if (folder) setFolderId(folder);
    return text({
      ok: true,
      expires_at: expiresAt || "unknown",
      warning: "This is a stopgap: IAM tokens live at most 12 hours. Use yd_set_service_account for a permanent fix.",
    });
  },
  async yd_set_client_id(args) {
    const id = String(args.client_id ?? "").trim();
    if (!id) return text({ error: "client_id is required" });
    setClientId(id);
    return text(authRequiredPayload("client_id saved — authorize next"));
  },
  async yd_set_token(args) {
    const token = String(args.oauth_token ?? "").trim();
    if (!token) return text({ error: "oauth_token is required" });
    let ok: boolean;
    try { ok = await validator(token); }
    catch (e) { return text({ error: `Could not validate token: ${e instanceof Error ? e.message : String(e)}` }); }
    if (!ok) return text({ ok: false, error: "Token invalid or rejected by Metrika API — not saved." });
    setToken(token);
    const folder = String(args.yc_folder_id ?? "").trim();
    if (folder) setFolderId(folder);
    return text({ ok: true, message: "OAuth token validated and saved successfully." });
  },
};
