# yandex-mcp Node/TS Rewrite + Self-Configuring OAuth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `yandex-mcp`, a standalone Node/TypeScript MCP server providing 123 Yandex Direct/Metrika/Wordstat + auth tools — porting tool behavior from the existing Python source in this repo and adding a self-configuring OAuth flow (clickable authorize link + token-set tools, no restart). The shipped project carries no fork/upstream attribution and no reference to the old `metrika-mcp` name.

**Architecture:** A low-level `@modelcontextprotocol/sdk` `Server` over stdio. `src/index.ts` merges tool definitions + handler maps from `tools/*.ts`, and its `tools/call` handler is the single dispatcher implementing the safety wrapper (READONLY/CONFIRM/whitelist), the auth-gate (returns a structured authorize-link payload when no/invalid token), and central `AuthError` handling. Credentials live in `src/auth.ts` backed by `~/.yandex-mcp/config.json` (`config.ts`); all API token reads are dynamic so `yd_set_token` takes effect without a restart.

**Tech Stack:** TypeScript (ESM, NodeNext), Node ≥ 20, `@modelcontextprotocol/sdk` v1, native `fetch`, `node:test` + `tsx` for tests, `tsc` for build.

## Global Constraints

- Runtime: **Node ≥ 20**, ESM only (`"type": "module"`); TS source uses explicit `.js` import specifiers (NodeNext).
- MCP SDK: **`@modelcontextprotocol/sdk` v1** — imports `@modelcontextprotocol/sdk/server/index.js`, `/server/stdio.js`, `/types.js`.
- Tool input schemas are **plain JSON Schema** objects (no `zod`).
- **All existing tool names are preserved verbatim** (`yd_*`, `yd_metrika_*`, `yd_wordstat_*`). 120 ported + 3 new auth tools = **123 total**.
- Env var names kept for back-compat: `YD_OAUTH_TOKEN`, `YC_FOLDER_ID`, `YD_SANDBOX`, `YD_LOGIN`, `YD_READONLY`, `YD_CONFIRM`, `YD_ALLOWED_LOGINS`, `YD_LOG_LEVEL`, `YD_LOG_FILE`, `YD_LOG_BODIES`. New: `YANDEX_OAUTH_CLIENT_ID`. Test-only: `YANDEX_MCP_CONFIG_DIR`.
- Credential store: `~/.yandex-mcp/config.json`. Resolution order: in-memory → config file → env seed.
- MCP server identity: `name: "yandex"`. Logger name: `yandex-mcp`.
- The Python source files in this repo are the **authoritative reference** for tool schemas and request-body shapes during porting.
- Build all work inside the current `metrika-mcp` directory; the directory rename and Python-file removal are the final task.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json`, `tsconfig.json` | Project + build config |
| `src/config.ts` | Load/save `~/.yandex-mcp/config.json` (defensive) |
| `src/auth.ts` | Credential state, resolution, authorize URL, `validateToken`, `AuthError`, auth-tool defs + handlers |
| `src/log.ts` | Logger (level/file/bodies) ported from Python logging block |
| `src/yandexApi.ts` | Direct `callApi`/`callApi501`, `requestWithRetry`, `logUnits`, `annotatePartial`, `iamExpiry`, `getIamToken` |
| `src/types.ts` | Shared `Tool`, `Handler`, `ToolContext`, `text()` helper |
| `src/tools/metrika.ts` | 43 Metrika tools (defs + handlers) |
| `src/tools/directCore.ts` | 46 Direct core tools (from `server.py` `TOOLS`) |
| `src/tools/directExtra.ts` | 26 Direct extra tools (from `tools_direct_extra.py`) |
| `src/tools/wordstat.ts` | 5 Wordstat tools |
| `src/index.ts` | SDK wiring, list/call handlers, dispatcher, safety wrapper, auth-gate, `main()` |
| `test/*.test.ts` | Offline `node:test` suites |

---

## Task 1: Project scaffold + minimal server

**Files:**
- Create: `package.json`, `tsconfig.json`, `src/index.ts`, `src/types.ts`
- Modify: `.gitignore`
- Test: `test/scaffold.test.ts`

**Interfaces:**
- Produces: `src/types.ts` exports `type ToolDef` (alias of SDK `Tool`), `type ToolContext = { clientLogin: string }`, `type Handler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<CallToolResult>`, and `function text(data: unknown): CallToolResult`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "yandex-mcp",
  "version": "2.0.0",
  "description": "MCP server for Yandex Direct, Metrika, and Wordstat with self-configuring OAuth",
  "license": "MIT",
  "type": "module",
  "bin": { "yandex-mcp": "build/index.js" },
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc",
    "start": "node build/index.js",
    "test": "node --import tsx --test test/*.test.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "build",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": false,
    "sourceMap": false
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Append build artifacts to `.gitignore`**

Add these lines to the existing `.gitignore`:

```
node_modules/
build/
```

- [ ] **Step 4: Create `src/types.ts`**

```ts
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type ToolDef = Tool;
export interface ToolContext { clientLogin: string; }
export type Handler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<CallToolResult>;

export function text(data: unknown): CallToolResult {
  const body = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text: body }] };
}
```

- [ ] **Step 5: Create minimal `src/index.ts`**

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { ToolDef } from "./types.js";
import { text } from "./types.js";

export const ALL_TOOLS: ToolDef[] = [];

const server = new Server({ name: "yandex", version: "2.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: ALL_TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name } = req.params;
  return text({ error: `Unknown tool: ${name}` });
});

export async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run only when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 6: Write the scaffold test**

```ts
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
```

- [ ] **Step 7: Install + build + test**

Run: `cd f:/projects/metrika-mcp && npm install && npm run build && npm test`
Expected: install succeeds; `tsc` exits 0 (creates `build/`); tests PASS (2 passing).

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json .gitignore src/ test/ package-lock.json
git commit -m "feat: scaffold yandex-mcp Node/TS project with minimal MCP server"
```

---

## Task 2: `config.ts` — credential file store

**Files:**
- Create: `src/config.ts`
- Test: `test/config.test.ts`

**Interfaces:**
- Produces: `interface StoredConfig { client_id?: string; oauth_token?: string; yc_folder_id?: string }`; `loadConfig(): StoredConfig`; `saveConfig(cfg: StoredConfig): void`. Config dir = `process.env.YANDEX_MCP_CONFIG_DIR` or `~/.yandex-mcp`; file = `<dir>/config.json`.

- [ ] **Step 1: Write the failing test**

```ts
// test/config.test.ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/config.ts'`.

- [ ] **Step 3: Implement `src/config.ts`**

```ts
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export interface StoredConfig {
  client_id?: string;
  oauth_token?: string;
  yc_folder_id?: string;
}

function configDir(): string {
  return process.env.YANDEX_MCP_CONFIG_DIR || join(homedir(), ".yandex-mcp");
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS (config tests green).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts test/config.test.ts
git commit -m "feat: add ~/.yandex-mcp/config.json credential store"
```

---

## Task 3: `auth.ts` — state, resolution, authorize URL, payload, AuthError

**Files:**
- Create: `src/auth.ts`
- Test: `test/auth.test.ts`

**Interfaces:**
- Consumes: `config.ts` (`loadConfig`, `saveConfig`, `StoredConfig`).
- Produces: `class AuthError extends Error`; `initAuth()`; `currentToken()`, `currentClientId()`, `currentFolderId(): string`; `setToken(t)`, `setClientId(id)`, `setFolderId(f): void`; `buildAuthorizeUrl(): string | null`; `authRequiredPayload(reason: string): Record<string, unknown>`; `validateToken(token: string, fetchImpl?: typeof fetch): Promise<boolean>`. Constants `REQUIRED_SCOPES`, `REGISTER_APP_URL`.

- [ ] **Step 1: Write the failing test**

```ts
// test/auth.test.ts
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

beforeEach(() => {
  process.env.YANDEX_MCP_CONFIG_DIR = mkdtempSync(join(tmpdir(), "ymcp-"));
  delete process.env.YD_OAUTH_TOKEN;
  delete process.env.YANDEX_OAUTH_CLIENT_ID;
  delete process.env.YC_FOLDER_ID;
});

test("env seed is used when no config file", async () => {
  process.env.YD_OAUTH_TOKEN = "envtok";
  const auth = await import(`../src/auth.ts?1`);
  auth.initAuth();
  assert.equal(auth.currentToken(), "envtok");
});

test("setClientId persists and buildAuthorizeUrl reflects it", async () => {
  const auth = await import(`../src/auth.ts?2`);
  auth.initAuth();
  assert.equal(auth.buildAuthorizeUrl(), null);
  auth.setClientId("my-client-id");
  assert.equal(auth.buildAuthorizeUrl(), "https://oauth.yandex.ru/authorize?response_type=token&client_id=my-client-id");
});

test("authRequiredPayload includes authorize_url when client_id set, omits otherwise", async () => {
  const auth = await import(`../src/auth.ts?3`);
  auth.initAuth();
  const p1 = auth.authRequiredPayload("none");
  assert.equal(p1.authorization_required, true);
  assert.equal("authorize_url" in p1, false);
  auth.setClientId("cid");
  const p2 = auth.authRequiredPayload("none");
  assert.equal(p2.authorize_url, "https://oauth.yandex.ru/authorize?response_type=token&client_id=cid");
});

test("in-memory set overrides file overrides env", async () => {
  process.env.YD_OAUTH_TOKEN = "envtok";
  const auth = await import(`../src/auth.ts?4`);
  auth.initAuth();
  auth.setToken("settok");
  assert.equal(auth.currentToken(), "settok");
});
```

> Note: the `?N` query suffix forces a fresh module instance per test (ESM module-state isolation).

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/auth.ts'`.

- [ ] **Step 3: Implement `src/auth.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS (auth tests green).

- [ ] **Step 5: Commit**

```bash
git add src/auth.ts test/auth.test.ts
git commit -m "feat: auth state, authorize-url builder, and auth-required payload"
```

---

## Task 4: Auth tools — `yd_auth_status`, `yd_set_client_id`, `yd_set_token`

**Files:**
- Modify: `src/auth.ts` (append tool defs + handlers)
- Test: `test/authtools.test.ts`

**Interfaces:**
- Consumes: `auth.ts` state functions, `validateToken`, `types.ts` `text`, `Handler`, `ToolDef`.
- Produces: `AUTH_TOOLS: ToolDef[]` and `authHandlers: Record<string, Handler>` exported from `auth.ts`. `validateToken` is injectable via module-level `setValidator(fn)` for tests.

- [ ] **Step 1: Write the failing test**

```ts
// test/authtools.test.ts
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

beforeEach(() => {
  process.env.YANDEX_MCP_CONFIG_DIR = mkdtempSync(join(tmpdir(), "ymcp-"));
  delete process.env.YD_OAUTH_TOKEN; delete process.env.YANDEX_OAUTH_CLIENT_ID;
});

test("yd_set_client_id returns the authorize url", async () => {
  const auth = await import(`../src/auth.ts?t1`);
  auth.initAuth();
  const res = await auth.authHandlers["yd_set_client_id"]({ client_id: "abc" }, { clientLogin: "" });
  const out = JSON.parse(res.content[0].text);
  assert.equal(out.authorize_url, "https://oauth.yandex.ru/authorize?response_type=token&client_id=abc");
  assert.equal(auth.currentClientId(), "abc");
});

test("yd_set_token validates and persists on success", async () => {
  const auth = await import(`../src/auth.ts?t2`);
  auth.initAuth();
  auth.setValidator(async () => true);
  const res = await auth.authHandlers["yd_set_token"]({ oauth_token: "good" }, { clientLogin: "" });
  assert.match(res.content[0].text, /success|saved|ok/i);
  assert.equal(auth.currentToken(), "good");
});

test("yd_set_token rejects an invalid token without persisting", async () => {
  const auth = await import(`../src/auth.ts?t3`);
  auth.initAuth();
  auth.setValidator(async () => false);
  const res = await auth.authHandlers["yd_set_token"]({ oauth_token: "bad" }, { clientLogin: "" });
  assert.match(res.content[0].text, /invalid|rejected|failed/i);
  assert.equal(auth.currentToken(), "");
});

test("yd_auth_status reports presence flags", async () => {
  const auth = await import(`../src/auth.ts?t4`);
  auth.initAuth();
  const res = await auth.authHandlers["yd_auth_status"]({}, { clientLogin: "" });
  const out = JSON.parse(res.content[0].text);
  assert.equal(out.client_id_set, false);
  assert.equal(out.token_set, false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `auth.authHandlers` undefined / `setValidator` not a function.

- [ ] **Step 3: Append to `src/auth.ts`**

```ts
import { text } from "./types.js";
import type { ToolDef, Handler } from "./types.js";

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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS (auth-tools tests green).

- [ ] **Step 5: Commit**

```bash
git add src/auth.ts test/authtools.test.ts
git commit -m "feat: yd_auth_status / yd_set_client_id / yd_set_token tools"
```

---

## Task 5: `log.ts` + `yandexApi.ts` — Direct API client, retry, IAM, helpers

**Files:**
- Create: `src/log.ts`, `src/yandexApi.ts`
- Test: `test/yandexApi.test.ts`

**Interfaces:**
- Consumes: `auth.ts` (`currentToken`, `currentFolderId`, `AuthError`), `log.ts`.
- Produces from `yandexApi.ts`:
  - `annotatePartial(data: any): any` — adds `_partial_success` when Direct list items carry `Errors`/`Warnings`.
  - `iamExpiry(data: { expiresAt?: string }, now: number): number` — epoch seconds (−60s) or `now + 11*3600` fallback.
  - `requestWithRetry(url, init, opts?): Promise<Response>` — backoff on 429/5xx honoring `Retry-After`; `opts.fetchImpl` injectable, `opts.maxAttempts` (default 4), `opts.sleep` injectable.
  - `callApi(service, method, params, ctx, opts?): Promise<any>` and `callApi501(...)` — v5/v501 Direct JSON; `Bearer currentToken()`, `Client-Login` = `ctx.clientLogin || process.env.YD_LOGIN`; throws `AuthError` on HTTP 401/403 or `error.error_code` ∈ {53,58}; returns `annotatePartial(json)`.
  - `getIamToken(): Promise<string>` — mints/caches IAM from `currentToken()`; re-mints when the OAuth token changed; honors `iamExpiry`.
  - `metrikaFetch(httpMethod, path, init): Promise<any>` — `OAuth currentToken()` against `https://api-metrika.yandex.net`; 204 → `{success:true}`; throws `AuthError` on 401/403; throws `Error` on other ≥400.
  - `baseUrl(): string` — sandbox-aware Direct base.

- [ ] **Step 1: Write the failing test**

```ts
// test/yandexApi.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { annotatePartial, iamExpiry, requestWithRetry } from "../src/yandexApi.ts";

test("annotatePartial flags per-item errors and warnings", () => {
  const out = annotatePartial({ result: { AddResults: [
    { Id: 1 },
    { Errors: [{ Code: 5, Message: "Bad" }] },
    { Warnings: [{ Code: 9, Message: "Trunc" }] },
  ] } });
  assert.equal(out._partial_success.ok, false);
  assert.equal(out._partial_success.error_count, 1);
  assert.equal(out._partial_success.warning_count, 1);
});

test("annotatePartial leaves clean results untouched", () => {
  const out = annotatePartial({ result: { AddResults: [{ Id: 1 }] } });
  assert.equal("_partial_success" in out, false);
});

test("iamExpiry parses ISO Z minus 60s and falls back to 11h", () => {
  // 2026-05-30T13:00:00Z == 1780146000
  assert.ok(Math.abs(iamExpiry({ expiresAt: "2026-05-30T13:00:00Z" }, 0) - (1780146000 - 60)) < 2);
  assert.equal(iamExpiry({}, 1000), 1000 + 11 * 3600);
});

test("requestWithRetry retries on 503 then succeeds", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return new Response(calls < 2 ? "busy" : "ok", { status: calls < 2 ? 503 : 200 });
  };
  const resp = await requestWithRetry("http://x", { method: "POST" }, { fetchImpl, sleep: async () => {} });
  assert.equal(resp.status, 200);
  assert.equal(calls, 2);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/yandexApi.ts'`.

- [ ] **Step 3: Implement `src/log.ts`**

```ts
type Level = "DEBUG" | "INFO" | "WARNING" | "ERROR";
const ORDER: Record<Level, number> = { DEBUG: 10, INFO: 20, WARNING: 30, ERROR: 40 };
const level = (process.env.YD_LOG_LEVEL || "INFO").toUpperCase() as Level;
const threshold = ORDER[level] ?? 20;
export const LOG_BODIES = (process.env.YD_LOG_BODIES || "").toLowerCase() === "true";

function emit(l: Level, msg: string): void {
  if (ORDER[l] < threshold) return;
  process.stderr.write(`${l} ${msg}\n`); // file logging via YD_LOG_FILE handled here if set
}
export const log = {
  debug: (m: string) => emit("DEBUG", m),
  info: (m: string) => emit("INFO", m),
  warning: (m: string) => emit("WARNING", m),
  error: (m: string) => emit("ERROR", m),
};
```

> Port note: if `YD_LOG_FILE` is set, also append to that file (sync `appendFileSync`). Keep default = stderr only.

- [ ] **Step 4: Implement `src/yandexApi.ts`**

```ts
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
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test`
Expected: PASS (yandexApi tests green).

- [ ] **Step 6: Commit**

```bash
git add src/log.ts src/yandexApi.ts test/yandexApi.test.ts
git commit -m "feat: Yandex Direct API client, retry/IAM/partial-success helpers, Metrika fetch"
```

---

## Task 6: `index.ts` dispatcher — safety wrapper + auth-gate + classification

**Files:**
- Modify: `src/index.ts`
- Test: `test/dispatch.test.ts`

**Interfaces:**
- Consumes: `auth.ts` (`initAuth`, `currentToken`, `AuthError`, `authRequiredPayload`, `AUTH_TOOLS`, `authHandlers`), `types.ts`.
- Produces (exported for tests): `isMutating(name): boolean`, `isDirect(name): boolean`, `dispatch(name, args): Promise<CallToolResult>`, `registerTools(defs, handlers)`, `ALL_TOOLS`. Handler registry `HANDLERS: Record<string, Handler>`.
- Env flags read at startup: `READONLY` (`YD_READONLY`), `CONFIRM` (`YD_CONFIRM`), `ALLOWED_LOGINS` (`YD_ALLOWED_LOGINS` CSV).

- [ ] **Step 1: Write the failing test**

```ts
// test/dispatch.test.ts
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

beforeEach(() => {
  process.env.YANDEX_MCP_CONFIG_DIR = mkdtempSync(join(tmpdir(), "ymcp-"));
  delete process.env.YD_OAUTH_TOKEN; delete process.env.YANDEX_OAUTH_CLIENT_ID;
  delete process.env.YD_READONLY; delete process.env.YD_CONFIRM;
});

test("classification: mutating vs read, direct vs metrika, auth tools non-mutating", async () => {
  const idx = await import(`../src/index.ts?d1`);
  assert.equal(idx.isMutating("yd_campaigns_add"), true);
  assert.equal(idx.isMutating("yd_metrika_goal_delete"), true);
  assert.equal(idx.isMutating("yd_campaigns_get"), false);
  assert.equal(idx.isMutating("yd_set_token"), false); // auth tool exempt
  assert.equal(idx.isDirect("yd_campaigns_add"), true);
  assert.equal(idx.isDirect("yd_metrika_report"), false);
  assert.equal(idx.isDirect("yd_wordstat_regions"), false);
});

test("auth-gate: data tool with no token returns authorization_required", async () => {
  const idx = await import(`../src/index.ts?d2`);
  const res = await idx.dispatch("yd_metrika_counters_get", {});
  const out = JSON.parse(res.content[0].text);
  assert.equal(out.authorization_required, true);
});

test("auth-gate: auth tools work without a token", async () => {
  const idx = await import(`../src/index.ts?d3`);
  const res = await idx.dispatch("yd_auth_status", {});
  const out = JSON.parse(res.content[0].text);
  assert.equal(out.token_set, false);
});

test("READONLY blocks a mutating tool", async () => {
  process.env.YD_READONLY = "true";
  process.env.YD_OAUTH_TOKEN = "tok";
  const idx = await import(`../src/index.ts?d4`);
  const res = await idx.dispatch("yd_campaigns_add", { name: "x", start_date: "2026-01-01" });
  const out = JSON.parse(res.content[0].text);
  assert.equal(out.denied, true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `idx.isMutating`/`idx.dispatch` undefined.

- [ ] **Step 3: Replace `src/index.ts`**

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolDef, Handler } from "./types.js";
import { text } from "./types.js";
import { initAuth, currentToken, AuthError, authRequiredPayload, AUTH_TOOLS, authHandlers } from "./auth.js";
import { log } from "./log.js";

const READONLY = (process.env.YD_READONLY || "").toLowerCase() === "true";
const CONFIRM = (process.env.YD_CONFIRM || "").toLowerCase() === "true";
const ALLOWED_LOGINS = (process.env.YD_ALLOWED_LOGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
const LOGIN = process.env.YD_LOGIN || "";

const MUTATING_TOKENS = ["_add", "_create", "_update", "_delete", "_action", "_set", "_toggle", "_link", "_unlink", "_upload"];
const AUTH_TOOL_NAMES = new Set(AUTH_TOOLS.map((t) => t.name));

export function isMutating(name: string): boolean {
  if (AUTH_TOOL_NAMES.has(name)) return false;
  return MUTATING_TOKENS.some((t) => name.includes(t));
}
export function isDirect(name: string): boolean {
  return name.startsWith("yd_") && !name.startsWith("yd_metrika") && !name.startsWith("yd_wordstat");
}

export const ALL_TOOLS: ToolDef[] = [...AUTH_TOOLS];
export const HANDLERS: Record<string, Handler> = { ...authHandlers };

export function registerTools(defs: ToolDef[], handlers: Record<string, Handler>): void {
  ALL_TOOLS.push(...defs);
  Object.assign(HANDLERS, handlers);
}

function deny(reason: string): CallToolResult {
  log.warning(`DENIED: ${reason}`);
  return text({ denied: true, reason });
}

export async function dispatch(name: string, rawArgs: Record<string, unknown>): Promise<CallToolResult> {
  const args = { ...rawArgs };
  const reqLogin = typeof args.client_login === "string" ? (args.client_login as string) : "";
  delete args.client_login;
  const confirm = Boolean(args.confirm);
  delete args.confirm;

  if (AUTH_TOOL_NAMES.has(name)) return authHandlers[name](args, { clientLogin: "" });

  const mutating = isMutating(name);
  if (mutating && READONLY) return deny(`Tool '${name}' is blocked: server runs in READ-ONLY mode (YD_READONLY=true).`);

  const effectiveLogin = reqLogin || LOGIN;
  if (isDirect(name) && ALLOWED_LOGINS.length && effectiveLogin && !ALLOWED_LOGINS.includes(effectiveLogin))
    return deny(`Client-Login '${effectiveLogin}' is not in the YD_ALLOWED_LOGINS whitelist.`);

  if (mutating && CONFIRM && !confirm)
    return text({ confirm_required: true, tool: name, client_login: effectiveLogin || null, arguments: args, note: "Mutating operation and YD_CONFIRM is enabled. Re-call with confirm=true to execute." });

  if (!currentToken()) return text(authRequiredPayload("No OAuth token configured"));

  const handler = HANDLERS[name];
  if (!handler) return text({ error: `Unknown tool: ${name}` });
  try {
    return await handler(args, { clientLogin: reqLogin });
  } catch (e) {
    if (e instanceof AuthError) return text(authRequiredPayload("Token invalid or expired — re-authorize"));
    log.error(`Tool ${name} failed: ${e instanceof Error ? e.stack || e.message : String(e)}`);
    return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }] };
  }
}

function augment(tool: ToolDef): ToolDef {
  const schema = JSON.parse(JSON.stringify(tool.inputSchema ?? { type: "object", properties: {} }));
  schema.properties ??= {};
  if (isDirect(tool.name)) schema.properties.client_login ??= { type: "string", description: "Optional. Override Client-Login for this call (agency multi-account)." };
  if (CONFIRM && isMutating(tool.name)) schema.properties.confirm ??= { type: "boolean", description: "Must be true to execute this mutating call (YD_CONFIRM is enabled)." };
  return { ...tool, inputSchema: schema };
}

const server = new Server({ name: "yandex", version: "2.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: ALL_TOOLS.map(augment) }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  return dispatch(name, args as Record<string, unknown>);
});

export async function main(): Promise<void> {
  initAuth();
  if (!currentToken()) log.warning("No OAuth token configured yet — use yd_set_client_id then yd_set_token. Server starting anyway.");
  log.info(`Starting yandex MCP server (tools=${ALL_TOOLS.length})`);
  await server.connect(new StdioServerTransport());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

> Note: `dispatch` calls `initAuth()` lazily for tests via a guard — add at top of `dispatch`: if state is uninitialized. Simplest: the tests call nothing else, and `authRequiredPayload`/`currentToken` read module state seeded at import by a top-level `initAuth()` call. Add `initAuth();` immediately after the env constants so importing the module seeds state from env/file. (Keep the `initAuth()` inside `main()` too — calling twice is safe.)

- [ ] **Step 4: Add top-level seed**

Add `initAuth();` right after the `const LOGIN = ...` line so module import seeds auth state (required by the dispatch tests, which import the module fresh per test).

- [ ] **Step 5: Run to verify it passes**

Run: `npm test`
Expected: PASS (dispatch tests green).

- [ ] **Step 6: Commit**

```bash
git add src/index.ts test/dispatch.test.ts
git commit -m "feat: central dispatcher with safety wrapper and auth-gate"
```

---

## Tool-porting tasks (7–10): deterministic translation recipe

Tasks 7–10 port the four tool groups. **The Python files in this repo are the exact reference.**
Each Python tool becomes (a) one entry in the module's `tools: ToolDef[]` array and (b) one entry
in its `handlers: Record<string, Handler>` map. The translation is mechanical — apply this recipe
exactly:

**Schema translation:**
- Python `_tool(name, desc, props, required)` / `Tool(name=…, description=…, inputSchema=…)` →
  `{ name, description, inputSchema: { type: "object", properties: {…}, required: [...] } }`.
- Property helpers map 1:1: `_prop_str(d)`→`{type:"string",description:d}`, `_prop_int(d)`→`{type:"integer",…}`,
  `_prop_arr_str(d)`→`{type:"array",items:{type:"string"},description:d}`, `_prop_counter()`→`{counter_id:{type:"integer",description:"Counter ID"}}`.
- Copy `enum`, nested `properties`, `items`, `required` verbatim. Keep **descriptions identical**.

**Handler translation:**
- Signature: `async (args, ctx) => { … return text(result); }`.
- Read args with the same keys: `args.counter_id`, `args.name`, etc. (cast as needed: `Number(args.counter_id)`, `String(args.name)`, `args.metrics as string[]`).
- Direct handlers: replace Python `await _api(client, service, method, params)` → `await callApi(service, method, params, ctx)`; `_api501` → `callApi501`; `config["folder_id"]` → `currentFolderId()`. Return `text(data.result ?? data)`.
- Metrika handlers: replace the Python `_crud_*`/`_metrika_api(client, method, path, token, params, body)` calls with `metrikaFetch(httpMethod, path, { params, body })`; preserve exact paths and query/body construction. Return `text(await metrikaFetch(...))`.
- Money helper: Python `_rubles_to_micros(x)` → `Math.round(x * 1_000_000)` (define once in `yandexApi.ts` as `export function rublesToMicros(r: number) { return Math.round(r * 1_000_000); }`).
- Wordstat: port `_wordstat_request` body-building and `getIamToken()`/`currentFolderId()` use; same endpoints.

**Per-module verification (the test gate for these tasks):**
1. `npm run build` — `tsc --strict` must pass (catches missing/typo'd fields).
2. The 1–2 behavior spot-check tests written in each task.
3. Final completeness is enforced by the **parity test in Task 11**.

---

## Task 7: Port Metrika tools (`src/tools/metrika.ts`)

**Files:**
- Create: `src/tools/metrika.ts`
- Modify: `src/index.ts` (register)
- Test: `test/metrika.test.ts`
- Reference: `tools_metrika.py` (lines 77–629) — 43 tools.

**Interfaces:**
- Consumes: `yandexApi.ts` `metrikaFetch`, `types.ts` `text`/`ToolDef`/`Handler`.
- Produces: `export const metrikaTools: ToolDef[]` (43 entries) and `export const metrikaHandlers: Record<string, Handler>` keyed by the exact names in `tools_metrika.py` `dispatch.update({...})` (lines 574–629).

- [ ] **Step 1: Worked example — port `yd_metrika_report` (def + handler)**

```ts
// src/tools/metrika.ts (excerpt — full file ports all 43 per the recipe)
import { metrikaFetch } from "../yandexApi.js";
import { text } from "../types.js";
import type { ToolDef, Handler } from "../types.js";

export const metrikaTools: ToolDef[] = [
  {
    name: "yd_metrika_report",
    description: "Get a Metrika report (table).",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        metrics: { type: "array", items: { type: "string" }, description: "Metrics, e.g. ym:s:visits, ym:s:pageviews, ym:s:bounceRate" },
        dimensions: { type: "array", items: { type: "string" }, description: "Dimensions, e.g. ym:s:date, ym:s:searchEngine" },
        date1: { type: "string", description: "Start date YYYY-MM-DD (default: 30 days ago)" },
        date2: { type: "string", description: "End date YYYY-MM-DD (default: today)" },
        filters: { type: "string", description: "Filter expression" },
        sort: { type: "array", items: { type: "string" }, description: "Sort fields" },
        limit: { type: "integer", description: "Max rows (default 100)" },
      },
      required: ["counter_id", "metrics"],
    },
  },
  // … remaining 42 tool defs …
];

export const metrikaHandlers: Record<string, Handler> = {
  async yd_metrika_report(args) {
    const params: Record<string, unknown> = {
      id: Number(args.counter_id),
      metrics: (args.metrics as string[]).join(","),
    };
    if (args.dimensions) params.dimensions = (args.dimensions as string[]).join(",");
    for (const k of ["date1", "date2", "filters"]) if (args[k]) params[k] = args[k];
    if (args.sort) params.sort = (args.sort as string[]).join(",");
    if (args.limit) params.limit = args.limit;
    return text(await metrikaFetch("get", "/stat/v1/data", { params }));
  },
  // … remaining 42 handlers …
};
```

- [ ] **Step 2: Port the remaining 42 Metrika tools** into `metrikaTools` and `metrikaHandlers`, applying the recipe to every tool in `tools_metrika.py`. Map the Python inner functions to handler keys exactly as in the `dispatch.update({...})` block (e.g. `counters_get` → `"yd_metrika_counters_get"`). For CRUD: `_crud_list`→`metrikaFetch("get", path, {params})`, `_crud_create`→`metrikaFetch("post", path, {body})`, `_crud_update`→`metrikaFetch("put", path, {body})`, `_crud_delete`→`metrikaFetch("delete", path)`. Preserve every path string verbatim (including the `?client_id_type=` query in upload tools).

- [ ] **Step 3: Register in `src/index.ts`**

Add after the other imports and before `main`:

```ts
import { metrikaTools, metrikaHandlers } from "./tools/metrika.js";
registerTools(metrikaTools, metrikaHandlers);
```

- [ ] **Step 4: Write behavior spot-check tests**

```ts
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
```

- [ ] **Step 5: Build + test**

Run: `npm run build && npm test`
Expected: `tsc` passes; metrika tests PASS (length === 43).

- [ ] **Step 6: Commit**

```bash
git add src/tools/metrika.ts src/index.ts test/metrika.test.ts
git commit -m "feat: port 43 Yandex Metrika tools to TypeScript"
```

---

## Task 8: Port Direct core tools (`src/tools/directCore.ts`)

**Files:**
- Create: `src/tools/directCore.ts`
- Modify: `src/index.ts` (register)
- Test: `test/directCore.test.ts`
- Reference: `server.py` `TOOLS` (lines 155–981, the 46 non-`yd_wordstat_*` entries) and their `_handle_*` functions (lines 1155–1740).

**Interfaces:**
- Consumes: `yandexApi.ts` `callApi`, `rublesToMicros`; `types.ts`.
- Produces: `export const directCoreTools: ToolDef[]` (46) and `export const directCoreHandlers: Record<string, Handler>` keyed by the `yd_*` names from the `_dispatch` if/elif chain (lines 1044–1135), **excluding** the four `yd_wordstat_*` names (those go to Task 10).

- [ ] **Step 1: Worked example — port `yd_campaigns_get` + the report flow**

```ts
// src/tools/directCore.ts (excerpt)
import { callApi, baseUrl, rublesToMicros } from "../yandexApi.js";
import { currentToken } from "../auth.js";
import { text } from "../types.js";
import type { ToolDef, Handler } from "../types.js";

export const directCoreTools: ToolDef[] = [
  {
    name: "yd_campaigns_get",
    description: "Get list of campaigns. Filters: types, states, statuses, ids.",
    inputSchema: {
      type: "object",
      properties: {
        types: { type: "array", items: { type: "string" }, description: "TEXT_CAMPAIGN, UNIFIED_CAMPAIGN, etc." },
        states: { type: "array", items: { type: "string" }, description: "ON, OFF, SUSPENDED, ARCHIVED, etc." },
        ids: { type: "array", items: { type: "integer" }, description: "Campaign IDs" },
      },
    },
  },
  // … remaining 45 defs …
];

export const directCoreHandlers: Record<string, Handler> = {
  async yd_campaigns_get(args, ctx) {
    const criteria: Record<string, unknown> = {};
    if (args.ids) criteria.Ids = args.ids;
    if (args.types) criteria.Types = args.types;
    if (args.states) criteria.States = args.states;
    const data = await callApi("campaigns", "get", {
      SelectionCriteria: criteria,
      FieldNames: ["Id", "Name", "Status", "State", "Type", "StartDate", "DailyBudget", "Statistics"],
    }, ctx);
    return text(data.result ?? data);
  },
  // … remaining 45 handlers …
};
```

- [ ] **Step 2: Port `yd_report`** (special: reports endpoint + polling). Translate `_handle_report` (server.py:1467–1511):

```ts
async yd_report(args, ctx) {
  const body = { params: {
    SelectionCriteria: { DateFrom: args.date_from, DateTo: args.date_to,
      ...(args.campaign_ids ? { Filter: [{ Field: "CampaignId", Operator: "IN", Values: (args.campaign_ids as number[]).map(String) }] } : {}) },
    FieldNames: args.field_names, ReportName: `report_${args.date_from}_${args.date_to}`,
    ReportType: args.report_type, DateRangeType: "CUSTOM_DATE", Format: "TSV", IncludeVAT: "YES", IncludeDiscount: "NO",
  } };
  const headers = { Authorization: `Bearer ${currentToken()}`, "Accept-Language": "ru", "Content-Type": "application/json",
    "Client-Login": ctx.clientLogin || process.env.YD_LOGIN || "", processingMode: "auto", returnMoneyInMicros: "false" };
  const url = `${baseUrl()}/reports`;
  for (let i = 0; i < 30; i++) {
    const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (resp.status === 200) return { content: [{ type: "text", text: await resp.text() }] };
    if (resp.status === 201 || resp.status === 202) { await new Promise((r) => setTimeout(r, Number(resp.headers.get("retryIn") || 5) * 1000)); continue; }
    return { content: [{ type: "text", text: `Report error ${resp.status}: ${await resp.text()}` }] };
  }
  return { content: [{ type: "text", text: "Report timeout after 30 attempts" }] };
}
```

- [ ] **Step 3: Port the remaining Direct core tools** (campaigns add/update/action, adgroups, ads, keywords, bids, dictionaries, keyword bids, bid modifiers, negative-keyword sets, sitelinks, ad extensions, changes, audience targets, retargeting lists, ad images, businesses, clients) applying the recipe. Use `rublesToMicros` everywhere the Python uses `_rubles_to_micros`. Handler keys must match the `_dispatch` chain names exactly.

- [ ] **Step 4: Add `rublesToMicros` to `yandexApi.ts`**

```ts
export function rublesToMicros(rubles: number): number { return Math.round(rubles * 1_000_000); }
```

- [ ] **Step 5: Register + spot-check test**

In `src/index.ts`: `import { directCoreTools, directCoreHandlers } from "./tools/directCore.js"; registerTools(directCoreTools, directCoreHandlers);`

```ts
// test/directCore.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { directCoreTools } from "../src/tools/directCore.ts";
import { rublesToMicros } from "../src/yandexApi.ts";

test("direct core exposes 46 tools, none wordstat", () => {
  assert.equal(directCoreTools.length, 46);
  assert.ok(directCoreTools.every((t) => !t.name.startsWith("yd_wordstat")));
});
test("rublesToMicros converts correctly", () => { assert.equal(rublesToMicros(500), 500_000_000); });
```

- [ ] **Step 6: Build + test + commit**

Run: `npm run build && npm test` → PASS.
```bash
git add src/tools/directCore.ts src/yandexApi.ts src/index.ts test/directCore.test.ts
git commit -m "feat: port 46 Yandex Direct core tools to TypeScript"
```

---

## Task 9: Port Direct extra tools (`src/tools/directExtra.ts`)

**Files:**
- Create: `src/tools/directExtra.ts`
- Modify: `src/index.ts` (register)
- Test: `test/directExtra.test.ts`
- Reference: `tools_direct_extra.py` `EXTRA_DIRECT_TOOLS` + `_NEW_TOOLS` (the 26 non-wordstat tools) and `_HANDLER_MAP` (lines 728–752) + new-tool handlers (lines 757–917).

**Interfaces:**
- Consumes: `yandexApi.ts` `callApi`, `callApi501`, `rublesToMicros`; `node:fs` for `yd_videos_upload` (base64 of a local file).
- Produces: `export const directExtraTools: ToolDef[]` (26), `export const directExtraHandlers: Record<string, Handler>` keyed exactly as `_HANDLER_MAP` plus `yd_excluded_sites_get/update`, `yd_blocked_ips_update`, `yd_campaign_strategy_update`. **Exclude** `yd_wordstat_user_info` (Task 10).

- [ ] **Step 1: Worked example — port `yd_vcards_add`**

```ts
// src/tools/directExtra.ts (excerpt)
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { callApi, callApi501, rublesToMicros } from "../yandexApi.js";
import { text } from "../types.js";
import type { ToolDef, Handler } from "../types.js";

export const directExtraTools: ToolDef[] = [
  {
    name: "yd_vcards_add",
    description: "Add a VCard (business card) to a campaign.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "integer", description: "Campaign ID" },
        company: { type: "string", description: "Company name" },
        city_code: { type: "string", description: "Phone city code (e.g. '495')" },
        phone_number: { type: "string", description: "Phone number (e.g. '1234567')" },
        city: { type: "string", description: "City name" },
        country: { type: "string", description: "Country name" },
        street: { type: "string" }, house: { type: "string" },
        work_time: { type: "string", description: "Working hours, e.g. '0;6;10;00;18;00'" },
        extra_message: { type: "string", description: "Additional message" },
      },
      required: ["campaign_id", "company", "city_code", "phone_number", "city", "country"],
    },
  },
  // … remaining 25 defs …
];

export const directExtraHandlers: Record<string, Handler> = {
  async yd_vcards_add(args, ctx) {
    const vcard: Record<string, unknown> = {
      CampaignId: args.campaign_id, CompanyName: args.company,
      Phone: { CountryCode: "+7", CityCode: args.city_code, PhoneNumber: args.phone_number },
      Country: args.country, City: args.city,
    };
    for (const [src, dst] of [["street", "Street"], ["house", "House"], ["work_time", "WorkTime"], ["extra_message", "ExtraMessage"]] as const)
      if (args[src]) vcard[dst] = args[src];
    const data = await callApi("vcards", "add", { VCards: [vcard] }, ctx);
    return text(data.result ?? data);
  },
  // … remaining 25 handlers (yd_videos_upload uses readFileSync + base64; yd_ads_add_shopping/yd_callouts_link use callApi501) …
};
```

- [ ] **Step 2: Port the remaining 25 extra tools**, including the v501 ones (`yd_ads_add_shopping`, `yd_callouts_link` → `callApi501`), `yd_videos_upload` (`readFileSync(path)` → base64 → `callApi("advideos","add",…,{timeoutMs:300000})`, name defaults to `basename(path)`), and the four `_NEW_TOOLS` handlers (`yd_excluded_sites_get/update`, `yd_blocked_ips_update`, `yd_campaign_strategy_update`) — translate their bodies from `tools_direct_extra.py:757–847` verbatim, using `rublesToMicros` for CPA/weekly-limit (`int(x*1_000_000)` → `rublesToMicros(x)`).

- [ ] **Step 3: Register + spot-check test**

In `src/index.ts`: `import { directExtraTools, directExtraHandlers } from "./tools/directExtra.js"; registerTools(directExtraTools, directExtraHandlers);`

```ts
// test/directExtra.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { directExtraTools } from "../src/tools/directExtra.ts";

test("direct extra exposes 26 tools, none wordstat", () => {
  assert.equal(directExtraTools.length, 26);
  assert.ok(directExtraTools.every((t) => !t.name.startsWith("yd_wordstat")));
});
```

- [ ] **Step 4: Build + test + commit**

Run: `npm run build && npm test` → PASS.
```bash
git add src/tools/directExtra.ts src/index.ts test/directExtra.test.ts
git commit -m "feat: port 26 Yandex Direct extra tools to TypeScript"
```

---

## Task 10: Port Wordstat tools (`src/tools/wordstat.ts`)

**Files:**
- Create: `src/tools/wordstat.ts`
- Modify: `src/index.ts` (register)
- Test: `test/wordstat.test.ts`
- Reference: `server.py` wordstat defs (lines 930–980) + handlers (lines 1872–1971); `tools_direct_extra.py` `yd_wordstat_user_info` (lines 713–723).

**Interfaces:**
- Consumes: `yandexApi.ts` `getIamToken`; `auth.ts` `currentFolderId`.
- Produces: `export const wordstatTools: ToolDef[]` (5: `yd_wordstat_top_requests`, `yd_wordstat_dynamics`, `yd_wordstat_regions`, `yd_wordstat_regions_tree`, `yd_wordstat_user_info`) and `export const wordstatHandlers`.

- [ ] **Step 1: Implement the module**

```ts
// src/tools/wordstat.ts
import { getIamToken } from "../yandexApi.js";
import { currentFolderId } from "../auth.js";
import { text } from "../types.js";
import type { ToolDef, Handler } from "../types.js";

const WORDSTAT_URL = "https://searchapi.api.cloud.yandex.net/v2/wordstat";
const PERIODS: Record<string, string> = { monthly: "PERIOD_MONTHLY", weekly: "PERIOD_WEEKLY", daily: "PERIOD_DAILY" };
const rfc3339 = (d: string) => (d?.includes("T") ? d : `${(d || "").trim()}T00:00:00Z`);

async function wordstatRequest(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const iam = await getIamToken();
  body.folderId = currentFolderId();
  const resp = await fetch(`${WORDSTAT_URL}${endpoint}`, {
    method: "POST", headers: { Authorization: `Bearer ${iam}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (resp.status === 429) throw new Error("Wordstat rate limit exceeded (429). Retry later.");
  if (resp.status === 503) throw new Error("Wordstat global quota exceeded (503).");
  if (resp.status !== 200) throw new Error(`Wordstat error ${resp.status}: ${(await resp.text()).slice(0, 500)}`);
  return resp.json();
}

export const wordstatTools: ToolDef[] = [
  /* port the 5 defs verbatim from the Python reference, descriptions identical */
];

export const wordstatHandlers: Record<string, Handler> = {
  async yd_wordstat_top_requests(args) {
    const num = Math.max(1, Math.min(Number(args.num_phrases ?? 30), 2000));
    const body: Record<string, unknown> = { phrase: args.phrase, numPhrases: num };
    if (args.regions) body.regions = args.regions;
    if (args.devices) body.devices = args.devices;
    return text(await wordstatRequest("/topRequests", body));
  },
  async yd_wordstat_dynamics(args) {
    const body: Record<string, unknown> = { phrase: args.phrase, period: PERIODS[String(args.period)] ?? args.period, fromDate: rfc3339(String(args.from_date)), toDate: rfc3339(String(args.to_date)) };
    if (args.regions) body.regions = args.regions;
    if (args.devices) body.devices = args.devices;
    return text(await wordstatRequest("/dynamics", body));
  },
  async yd_wordstat_regions(args) {
    const body: Record<string, unknown> = { phrase: args.phrase };
    if (args.region_type) body.regionType = args.region_type;
    if (args.devices) body.devices = args.devices;
    return text(await wordstatRequest("/regions", body));
  },
  async yd_wordstat_regions_tree() { return text(await wordstatRequest("/getRegionsTree", {})); },
  async yd_wordstat_user_info() {
    const iam = await getIamToken();
    const resp = await fetch("https://searchapi.api.cloud.yandex.net/v2/wordstat/userInfo", {
      method: "POST", headers: { Authorization: `Bearer ${iam}`, "Content-Type": "application/json" }, body: JSON.stringify({ folderId: currentFolderId() }),
    });
    if (resp.status !== 200) throw new Error(`Wordstat userInfo error ${resp.status}: ${(await resp.text()).slice(0, 500)}`);
    return text(await resp.json());
  },
};
```

- [ ] **Step 2: Port the 5 `wordstatTools` defs** verbatim from the Python references (keep descriptions/enums identical).

- [ ] **Step 3: Register + spot-check test**

In `src/index.ts`: `import { wordstatTools, wordstatHandlers } from "./tools/wordstat.js"; registerTools(wordstatTools, wordstatHandlers);`

```ts
// test/wordstat.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { wordstatTools } from "../src/tools/wordstat.ts";
test("wordstat exposes 5 tools", () => {
  assert.equal(wordstatTools.length, 5);
  assert.ok(wordstatTools.every((t) => t.name.startsWith("yd_wordstat_")));
});
```

- [ ] **Step 4: Build + test + commit**

Run: `npm run build && npm test` → PASS.
```bash
git add src/tools/wordstat.ts src/index.ts test/wordstat.test.ts
git commit -m "feat: port 5 Wordstat tools to TypeScript"
```

---

## Task 11: Parity test — exactly 123 tools with the expected names

**Files:**
- Test: `test/parity.test.ts`

**Interfaces:**
- Consumes: `src/index.ts` `ALL_TOOLS` (populated by all `registerTools` calls on import).

- [ ] **Step 1: Write the parity test (the completeness gate)**

```ts
// test/parity.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_TOOLS } from "../src/index.ts";

const EXPECTED = [
  // auth (3)
  "yd_auth_status", "yd_set_client_id", "yd_set_token",
  // direct core (46)
  "yd_campaigns_get","yd_campaigns_add","yd_campaigns_update","yd_campaigns_action",
  "yd_adgroups_add","yd_adgroups_get","yd_ads_add","yd_ads_update","yd_ads_get","yd_ads_action",
  "yd_keywords_add","yd_keywords_get","yd_keywords_research","yd_bids_set","yd_report","yd_dictionaries",
  "yd_keywords_has_volume","yd_keyword_bids_get","yd_keyword_bids_set","yd_keyword_bids_set_auto",
  "yd_bid_modifiers_add","yd_bid_modifiers_get","yd_bid_modifiers_set","yd_bid_modifiers_delete",
  "yd_negative_keywords_sets_add","yd_negative_keywords_sets_get","yd_negative_keywords_sets_update","yd_negative_keywords_sets_delete",
  "yd_sitelinks_add","yd_sitelinks_get","yd_sitelinks_delete",
  "yd_ad_extensions_add","yd_ad_extensions_get","yd_ad_extensions_delete","yd_changes_check",
  "yd_audience_targets_add","yd_audience_targets_get","yd_audience_targets_delete",
  "yd_retargeting_lists_add","yd_retargeting_lists_get","yd_retargeting_lists_delete",
  "yd_ad_images_add","yd_ad_images_get","yd_ad_images_delete","yd_businesses_get","yd_clients_get",
  // direct extra (26)
  "yd_vcards_add","yd_vcards_get","yd_vcards_delete",
  "yd_feeds_add","yd_feeds_get","yd_feeds_update","yd_feeds_delete",
  "yd_smart_targets_add","yd_smart_targets_get","yd_smart_targets_action",
  "yd_ads_add_dynamic","yd_ads_add_image","yd_ads_add_shopping",
  "yd_videos_upload","yd_videos_get","yd_creatives_add","yd_creatives_get",
  "yd_callouts_link","yd_bid_modifiers_toggle","yd_adgroups_update","yd_regions_get","yd_interests_get",
  "yd_excluded_sites_get","yd_excluded_sites_update","yd_blocked_ips_update","yd_campaign_strategy_update",
  // wordstat (5)
  "yd_wordstat_top_requests","yd_wordstat_dynamics","yd_wordstat_regions","yd_wordstat_regions_tree","yd_wordstat_user_info",
  // metrika (43)
  "yd_metrika_counters_get","yd_metrika_counter_get","yd_metrika_counter_create","yd_metrika_counter_update","yd_metrika_counter_delete",
  "yd_metrika_goals_get","yd_metrika_goal_create","yd_metrika_goal_update","yd_metrika_goal_delete",
  "yd_metrika_segments_get","yd_metrika_segment_create","yd_metrika_segment_update","yd_metrika_segment_delete",
  "yd_metrika_filters_get","yd_metrika_filter_create","yd_metrika_filter_update","yd_metrika_filter_delete",
  "yd_metrika_grants_get","yd_metrika_grant_add","yd_metrika_grant_update","yd_metrika_grant_delete",
  "yd_metrika_report","yd_metrika_report_by_time","yd_metrika_report_comparison","yd_metrika_report_drilldown",
  "yd_metrika_upload_conversions","yd_metrika_conversions_status","yd_metrika_upload_calls","yd_metrika_upload_expenses","yd_metrika_upload_user_params",
  "yd_metrika_labels_get","yd_metrika_label_create","yd_metrika_label_update","yd_metrika_label_delete",
  "yd_metrika_label_link","yd_metrika_label_unlink",
  "yd_metrika_annotations_get","yd_metrika_annotation_create","yd_metrika_annotation_update","yd_metrika_annotation_delete",
  "yd_metrika_delegates_get","yd_metrika_delegate_add","yd_metrika_delegate_delete",
];

test("ALL_TOOLS has exactly the expected 123 tool names", () => {
  const actual = ALL_TOOLS.map((t) => t.name).sort();
  const expected = [...EXPECTED].sort();
  assert.equal(actual.length, 123);
  assert.deepEqual(actual, expected);
});

test("every tool has a handler registered", async () => {
  const { HANDLERS } = await import("../src/index.ts");
  for (const t of ALL_TOOLS) assert.ok(HANDLERS[t.name], `missing handler: ${t.name}`);
});
```

- [ ] **Step 2: Run + fix until green**

Run: `npm test`
Expected: PASS. If it fails, the diff names the missing/extra/misnamed tool — fix that tool's def/handler key and re-run.

- [ ] **Step 3: Commit**

```bash
git add test/parity.test.ts
git commit -m "test: assert full 123-tool parity and handler coverage"
```

---

## Task 12: Docs — README + .env.example

**Files:**
- Modify: `README.md`, `.env.example`

**Interfaces:** none (documentation).

- [ ] **Step 1: Rewrite `.env.example`**

```bash
# All credentials are OPTIONAL — the server starts without them and guides you via tools
# (yd_auth_status / yd_set_client_id / yd_set_token). They are read once at startup as seeds;
# the source of truth is ~/.yandex-mcp/config.json (written by yd_set_token / yd_set_client_id).

# OAuth app client_id (register at https://oauth.yandex.ru/client/new with scopes
# direct:api, metrika:read, metrika:write, cloud:auth)
YANDEX_OAUTH_CLIENT_ID=

# OAuth access token (also settable at runtime via yd_set_token)
YD_OAUTH_TOKEN=

# Yandex Cloud folder ID for Wordstat (also settable via yd_set_token)
YC_FOLDER_ID=

# Optional Direct settings
YD_SANDBOX=false
YD_LOGIN=

# Safety / access control
YD_READONLY=false
YD_CONFIRM=false
YD_ALLOWED_LOGINS=

# Logging
YD_LOG_LEVEL=INFO
YD_LOG_FILE=
YD_LOG_BODIES=false
```

- [ ] **Step 2: Rewrite `README.md`** — replace the Python install/setup with Node, and add the auth flow. Required content:
  - Title `# yandex-mcp`, one-line description (Direct + Metrika + Wordstat, self-configuring OAuth).
  - **Install:** `npm install && npm run build`.
  - **MCP client config** snippet:
    ```json
    { "yandex": { "type": "stdio", "command": "node", "args": ["F:/projects/yandex-mcp/build/index.js"] } }
    ```
  - **Авторизация (self-setup):** register app → call `yd_set_client_id` (returns link) → open link, approve, copy `access_token` → call `yd_set_token`. Note `~/.yandex-mcp/config.json` is the source of truth; env vars are optional seeds.
  - Keep the full tool tables (Direct/Metrika/Wordstat) and the safety/env table.
  - **Clean new-project identity:** do NOT include any fork/upstream attribution, the old README's "доработки форка" section, or any mention of the `metrika-mcp`/`yandex-ads-mcp` names or the `Yurich-ru/yandex-ads-mcp` repo. Write it as a fresh standalone project.

- [ ] **Step 3: Commit**

```bash
git add README.md .env.example
git commit -m "docs: rewrite README and .env.example for Node yandex-mcp + auth flow"
```

---

## Task 13: Remove Python + rename directory

**Files:**
- Delete: `server.py`, `tools_metrika.py`, `tools_direct_extra.py`, `test_safety.py`, `requirements.txt`, `pyproject.toml`
- Rename: directory `metrika-mcp` → `yandex-mcp`

**Interfaces:** none.

- [ ] **Step 1: Confirm the Node build + tests are green**

Run: `npm run build && npm test`
Expected: all suites PASS (incl. parity 123).

- [ ] **Step 2: Remove the Python files**

```bash
git rm server.py tools_metrika.py tools_direct_extra.py test_safety.py requirements.txt pyproject.toml
git commit -m "chore: remove Python implementation (superseded by Node port)"
```

- [ ] **Step 2b: Detach from the upstream repo (this is a standalone new project)**

Verify the remote points at upstream, then remove it so nothing is accidentally pushed to the old fork:

```bash
git remote -v                 # expect: origin  https://github.com/Yurich-ru/yandex-ads-mcp.git
git remote remove origin
git remote -v                 # expect: (no output)
```

- [ ] **Step 3: Rename the directory** (run from `f:/projects`, with no shell/editor holding the folder open — on Windows a directory in use cannot be renamed)

```bash
cd /f/projects && mv metrika-mcp yandex-mcp
```

- [ ] **Step 4: Update the MCP client config (manual)**

In `~/.claude.json` (and any other MCP client), change the server entry to:
`"command": "node", "args": ["F:/projects/yandex-mcp/build/index.js"]`, then restart the client.

- [ ] **Step 5: Smoke-test the server starts**

Run: `cd /f/projects/yandex-mcp && node build/index.js` (it should start and wait on stdio; Ctrl-C to exit). Optionally verify `yd_auth_status` via the MCP client.

---

## Self-Review

**Spec coverage:**
- Faithful port of all 120 tools → Tasks 7–10 + parity gate Task 11. ✓
- Self-configuring auth (link + set_token, no restart) → Tasks 3–4 + gate Task 6. ✓
- User-supplied client_id → Task 4 `yd_set_client_id`. ✓
- Keep all three services, no renames → parity list Task 11 uses original names. ✓
- Rename project + dir → Tasks 1 (package/identity) + 13 (dir + Python removal). ✓
- Server never hard-exits → Task 6 `main()` warning. ✓
- Dynamic token → all handlers read `currentToken()` via `yandexApi`; Task 5/6. ✓
- Safety wrapper kept (`YD_*`) → Task 6. ✓
- Tests offline (`node:test`, injected fetch) → Tasks 2–6 + 11. ✓
- Docs → Task 12. ✓
- Back-compat env (`YD_OAUTH_TOKEN`/`YC_FOLDER_ID`) → Task 3 `initAuth`. ✓

**Placeholder scan:** Infra tasks (1–6, 11) contain complete code. Tool-port tasks (7–10) use a fully-specified deterministic recipe + a worked example each + the Python source as the named line-referenced authority + the parity test as the completeness gate — this is the correct way to plan a mechanical 1:1 port and is not a placeholder.

**Type consistency:** `Handler = (args, ctx)` used everywhere; `ToolContext.clientLogin` consistent; `callApi(service, method, params, ctx)` / `metrikaFetch(method, path, {params,body})` / `getIamToken()` / `currentToken()` signatures match across tasks; `registerTools(defs, handlers)` and `ALL_TOOLS`/`HANDLERS` consistent between Task 6 and Tasks 7–11; `text()` return type `CallToolResult` consistent.

---

## Addendum — Task W: Yandex Webmaster API (added during execution)

After Task 10, a fourth service was added at the user's request: **Yandex Webmaster API v4** —
`src/tools/webmaster.ts`, **30 tools** (`yd_webmaster_*`), implemented from the verified official
endpoint table (no Python source existed). Adds `webmasterFetch` + `getWebmasterUserId` to
`yandexApi.ts` (auto-prefix `/user/{user_id}`, cached user-id, repeated array query params,
AuthError on 401/403), appends `webmaster:hostview`/`webmaster:verify` to `REQUIRED_SCOPES`, and
extends `isDirect()` to exclude `yd_webmaster_*`. Consequently **Task 11 parity asserts 153 tools**
(123 + 30), and **Task 12 docs** include the Webmaster table + the two webmaster scopes. Inserted
into the execution order between Task 10 and Task 11.
