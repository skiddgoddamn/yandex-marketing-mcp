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
  };
}

export function currentToken(): string { return state.oauth_token ?? ""; }
export function currentClientId(): string { return state.client_id ?? ""; }
export function currentFolderId(): string { return state.yc_folder_id ?? ""; }

function persist(): void {
  saveConfig({
    client_id: state.client_id || undefined,
    oauth_token: state.oauth_token || undefined,
    yc_folder_id: state.yc_folder_id || undefined,
  });
}

export function setClientId(id: string): void { state.client_id = id; persist(); }
export function setToken(t: string): void { state.oauth_token = t; persist(); }
export function setFolderId(f: string): void { state.yc_folder_id = f; persist(); }

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
];

export const authHandlers: Record<string, Handler> = {
  async yd_auth_status() {
    const token = currentToken();
    let tokenValid: boolean | "unknown" = "unknown";
    if (token) { try { tokenValid = await validator(token); } catch { tokenValid = "unknown"; } }
    return text({
      client_id_set: Boolean(currentClientId()),
      token_set: Boolean(token),
      token_valid: tokenValid,
      folder_id_set: Boolean(currentFolderId()),
      authorize_url: buildAuthorizeUrl(),
      hint: token
        ? "Configured. If calls fail with authorization_required, the token is likely expired — re-run yd_set_client_id → authorize → yd_set_token."
        : (currentClientId() ? "Open authorize_url, then call yd_set_token." : "Call yd_set_client_id with your app's client_id first."),
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
