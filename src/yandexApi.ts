import { currentToken, currentFolderId, AuthError } from "./auth.js";
import { log, LOG_BODIES } from "./log.js";
import type { ToolContext } from "./types.js";

const API_URL = process.env.YD_API_URL || "https://api.direct.yandex.com/json/v5";
const SANDBOX_URL = "https://api-sandbox.direct.yandex.com/json/v5";
const USE_SANDBOX = (process.env.YD_SANDBOX || "").toLowerCase() === "true";
const METRIKA_BASE = "https://api-metrika.yandex.net";
const AUTH_ERROR_CODES = new Set([53, 58]);
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

export function baseUrl(): string { return USE_SANDBOX ? SANDBOX_URL : API_URL; }

export function annotatePartial(data: any): any {
  const result = data?.result;
  if (!result || typeof result !== "object") return data;
  const issues: any[] = [];
  for (const [key, val] of Object.entries(result)) {
    if (!Array.isArray(val)) continue;
    val.forEach((item: any, idx: number) => {
      if (item && typeof item === "object") {
        if (item.Errors) issues.push({ list: key, index: idx, level: "error", messages: item.Errors });
        if (item.Warnings) issues.push({ list: key, index: idx, level: "warning", messages: item.Warnings });
      }
    });
  }
  if (!issues.length) return data;
  const errorCount = issues.filter((i) => i.level === "error").length;
  return { ...data, _partial_success: { ok: errorCount === 0, error_count: errorCount, warning_count: issues.length - errorCount, issues } };
}

export function iamExpiry(data: { expiresAt?: string }, now: number): number {
  if (data.expiresAt) {
    const cleaned = data.expiresAt.replace(/(\.\d{6})\d+/, "$1");
    const ms = Date.parse(cleaned);
    if (!Number.isNaN(ms)) return Math.floor(ms / 1000) - 60;
  }
  return now + 11 * 3600;
}

interface RetryOpts { fetchImpl?: typeof fetch; maxAttempts?: number; sleep?: (ms: number) => Promise<void>; }

export async function requestWithRetry(url: string, init: RequestInit, opts: RetryOpts = {}): Promise<Response> {
  const f = opts.fetchImpl ?? fetch;
  const maxAttempts = opts.maxAttempts ?? 4;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let delay = 1000;
  let resp = await f(url, init);
  for (let attempt = 1; attempt < maxAttempts; attempt++) {
    if (!RETRY_STATUS.has(resp.status)) break;
    const ra = resp.headers.get("Retry-After");
    const wait = ra && /^\d+$/.test(ra) ? Number(ra) * 1000 : delay;
    log.warning(`HTTP ${resp.status} from ${url} — retry ${attempt}/${maxAttempts - 1} in ${wait}ms`);
    await sleep(wait);
    delay = Math.min(delay * 2, 30000);
    resp = await f(url, init);
  }
  return resp;
}

function directHeaders(ctx: ToolContext): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${currentToken()}`,
    "Accept-Language": "ru",
    "Content-Type": "application/json",
  };
  const login = ctx.clientLogin || process.env.YD_LOGIN || "";
  if (login) h["Client-Login"] = login;
  return h;
}

async function directCall(url: string, service: string, method: string, params: unknown, ctx: ToolContext, timeoutMs = 120000): Promise<any> {
  const body = JSON.stringify({ method, params });
  if (LOG_BODIES) log.debug(`REQUEST ${url} ${method}: ${body.slice(0, 2000)}`);
  const resp = await requestWithRetry(url, { method: "POST", headers: directHeaders(ctx), body, signal: AbortSignal.timeout(timeoutMs) });
  if (resp.status === 401 || resp.status === 403) throw new AuthError();
  const data = await resp.json();
  if (LOG_BODIES) log.debug(`RESPONSE ${resp.status}: ${JSON.stringify(data).slice(0, 2000)}`);
  if (data.error) {
    if (AUTH_ERROR_CODES.has(Number(data.error.error_code))) throw new AuthError();
    throw new Error(`API error ${data.error.error_code}: ${data.error.error_detail || data.error.error_string}`);
  }
  return annotatePartial(data);
}

export function callApi(service: string, method: string, params: unknown, ctx: ToolContext, opts?: { timeoutMs?: number }): Promise<any> {
  return directCall(`${baseUrl()}/${service}`, service, method, params, ctx, opts?.timeoutMs);
}

export function callApi501(service: string, method: string, params: unknown, ctx: ToolContext, opts?: { timeoutMs?: number }): Promise<any> {
  return directCall(`${baseUrl().replace("/v5", "/v501")}/${service}`, service, method, params, ctx, opts?.timeoutMs);
}

let iamCache = { token: "", expires: 0, oauth: "" };

export async function getIamToken(fetchImpl: typeof fetch = fetch): Promise<string> {
  const now = Date.now() / 1000;
  const oauth = currentToken();
  if (iamCache.token && iamCache.oauth === oauth && iamCache.expires > now + 300) return iamCache.token;
  const resp = await fetchImpl("https://iam.api.cloud.yandex.net/iam/v1/tokens", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ yandexPassportOauthToken: oauth }),
  });
  const data = await resp.json();
  if (!data.iamToken) throw new Error(`Failed to get IAM token: ${JSON.stringify(data)}`);
  iamCache = { token: data.iamToken, expires: iamExpiry(data, now), oauth };
  return iamCache.token;
}

export function rublesToMicros(rubles: number): number { return Math.round(rubles * 1_000_000); }

export async function metrikaFetch(httpMethod: string, path: string, init: { params?: Record<string, unknown>; body?: unknown } = {}, fetchImpl: typeof fetch = fetch): Promise<any> {
  let url = `${METRIKA_BASE}${path}`;
  if (init.params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(init.params)) if (v !== undefined && v !== null) qs.set(k, String(v));
    const sep = url.includes("?") ? "&" : "?";
    if ([...qs].length) url += sep + qs.toString();
  }
  const reqInit: RequestInit = { method: httpMethod.toUpperCase(), headers: { Authorization: `OAuth ${currentToken()}` } };
  if (init.body !== undefined) {
    (reqInit.headers as Record<string, string>)["Content-Type"] = "application/json";
    reqInit.body = JSON.stringify(init.body);
  }
  const resp = await fetchImpl(url, reqInit);
  if (resp.status === 204) return { success: true };
  if (resp.status === 401 || resp.status === 403) throw new AuthError();
  if (resp.status >= 400) throw new Error(`Metrika API error ${resp.status}: ${(await resp.text()).slice(0, 500)}`);
  return resp.json();
}

const WEBMASTER_BASE = "https://api.webmaster.yandex.net/v4";
let webmasterUserCache = { userId: "", oauth: "" };

export function resetWebmasterCache(): void { webmasterUserCache = { userId: "", oauth: "" }; }

export async function getWebmasterUserId(fetchImpl: typeof fetch = fetch): Promise<string> {
  const oauth = currentToken();
  if (webmasterUserCache.userId && webmasterUserCache.oauth === oauth) return webmasterUserCache.userId;
  const resp = await fetchImpl(`${WEBMASTER_BASE}/user/`, { headers: { Authorization: `OAuth ${oauth}` } });
  if (resp.status === 401 || resp.status === 403) throw new AuthError();
  if (resp.status >= 400) throw new Error(`Webmaster API error ${resp.status}: ${(await resp.text()).slice(0, 500)}`);
  const data = await resp.json();
  webmasterUserCache = { userId: String(data.user_id), oauth };
  return webmasterUserCache.userId;
}

export async function webmasterFetch(
  httpMethod: string,
  subpath: string,
  init: { params?: Record<string, unknown>; body?: unknown } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<any> {
  const userId = await getWebmasterUserId(fetchImpl);
  let url = `${WEBMASTER_BASE}/user/${userId}${subpath}`;
  if (init.params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(init.params)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) v.forEach((x) => qs.append(k, String(x)));
      else qs.append(k, String(v));
    }
    const q = qs.toString();
    if (q) url += (url.includes("?") ? "&" : "?") + q;
  }
  const reqInit: RequestInit = { method: httpMethod.toUpperCase(), headers: { Authorization: `OAuth ${currentToken()}` } };
  if (init.body !== undefined) {
    (reqInit.headers as Record<string, string>)["Content-Type"] = "application/json";
    reqInit.body = JSON.stringify(init.body);
  }
  const resp = await fetchImpl(url, reqInit);
  if (resp.status === 204) return { success: true };
  if (resp.status === 401 || resp.status === 403) throw new AuthError();
  if (resp.status >= 400) throw new Error(`Webmaster API error ${resp.status}: ${(await resp.text()).slice(0, 500)}`);
  return resp.json();
}
