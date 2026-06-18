import { loadConfig, saveConfig, type StoredConfig } from "./config.js";

export class AuthError extends Error {
  constructor(message = "Yandex OAuth token is missing, invalid, or expired") {
    super(message);
    this.name = "AuthError";
  }
}

export const REQUIRED_SCOPES = ["direct:api", "metrika:read", "metrika:write", "cloud:auth"];
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
