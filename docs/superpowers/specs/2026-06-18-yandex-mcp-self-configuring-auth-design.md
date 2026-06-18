# yandex-mcp — Node/TypeScript rewrite + self-configuring OAuth + rename

**Date:** 2026-06-18
**Status:** Approved design (Node/TS), pending spec review
**Scope:** Single implementation plan

## 1. Context

`yandex-mcp` is a new, standalone Node/TypeScript **stdio** MCP server exposing 120 tools across
three Yandex services. A Python prototype currently lives in this repo and is used **only** as the
porting reference; the shipped project carries **no fork/upstream attribution** and no reference to
the old `metrika-mcp` name. The Python sources being ported:

- **Yandex Direct** (77 tools) — `server.py` inline `TOOLS` + `tools_direct_extra.py`
- **Yandex Metrika** (43 tools) — `tools_metrika.py`
- **Wordstat** (Cloud Search API via IAM token) — `server.py` + `tools_direct_extra.py`

Two changes are wanted:

1. **Rewrite from Python to Node/TypeScript** (full port of all 120 tools), keeping every tool and
   every tool name identical.
2. **Add self-configuring OAuth** so a missing/invalid token no longer blocks the server: the
   server returns a clickable Yandex authorize link, and tools persist the supplied token without
   a restart.

Plus a **rename** from the misleading `metrika-mcp` to `yandex-mcp` (it covers all three services).

One OAuth token serves **both Direct and Metrika**; Wordstat derives an **IAM token** from the same
OAuth token and additionally needs `YC_FOLDER_ID`.

## 2. Goals

1. **Faithful Node/TS port.** All 120 tools, same names (`yd_*`, `yd_metrika_*`, `yd_wordstat_*`),
   same input schemas, same API behavior (retry/backoff, IAM caching, partial-success annotation).
2. **Self-configuring auth.** A call without a valid token returns a structured
   "authorization required" response with a clickable authorize URL; `yd_set_token` persists the
   token — **no client restart**.
3. **User-supplied client_id.** Nothing baked in; `yd_set_client_id` captures and persists it.
4. **Keep all three services**; no tools deleted, no tool renames.
5. **Rename project** to `yandex-mcp` (incl. physical directory rename).
6. **Server never hard-exits** on missing token; it starts and guides via tool responses.

## 3. Non-goals (YAGNI)

- No OAuth authorization-code / loopback flow (implicit flow only).
- No multi-user / per-session token storage (single local credential store).
- No tool-identifier renames (`yd_metrika_*` stays).
- No automatic browser opening; link returned as text.
- No `zod` runtime validation layer — input schemas stay plain JSON Schema (faithful port). May be
  revisited later; not in this scope.
- No automatic edit of the user's MCP client config after the rename/stack change (documented
  manual step).

## 4. Target stack & layout

- **Language:** TypeScript, ESM (`"type": "module"`), target **Node ≥ 18** (native `fetch`).
- **MCP SDK:** `@modelcontextprotocol/sdk` — low-level `Server` + `StdioServerTransport`, with
  `setRequestHandler(ListToolsRequestSchema, …)` and `setRequestHandler(CallToolRequestSchema, …)`.
  This mirrors the Python `list_tools` + central `call_tool` dispatcher and preserves the auth-gate
  design. (Exact import paths/API verified against current SDK docs via context7 during build.)
- **HTTP:** global `fetch`; a `requestWithRetry()` helper ports the existing capped exponential
  backoff + `Retry-After` handling.
- **Tests:** built-in `node:test` + `node:assert` (no extra deps), offline.
- **Build/run:** `tsc` → `build/`; `node build/index.js` is the server entry; `bin` maps
  `yandex-mcp` → `build/index.js` for `npx`.

```
yandex-mcp/
  package.json            # name yandex-mcp, type module, bin, scripts (build/start/test)
  tsconfig.json           # NodeNext, strict, outDir build/
  .env.example
  README.md
  src/
    index.ts              # wire Server + StdioServerTransport; list/call handlers; auth-gate; dispatch; main()
    auth.ts               # credential store, persistence, link, validate, AuthError, auth tool defs+handlers
    yandexApi.ts          # Direct v5/v501 callApi, requestWithRetry, logUnits, annotatePartial, getIamToken, iamExpiry
    config.ts             # paths + JSON load/save for ~/.yandex-mcp/config.json
    tools/
      directCore.ts       # campaigns, adgroups, ads, keywords, bids, reports, dictionaries, etc.
      directExtra.ts      # vcards, feeds, smart targets, ad types, videos, creatives, excluded sites, strategy
      metrika.ts          # 43 Metrika tools
      wordstat.ts         # wordstat tools (topRequests, dynamics, regions, regionsTree, userInfo)
  test/
    safety.test.ts        # offline tests (auth, classification, persistence, payloads, validate)
  build/                  # compiled output (gitignored)
```

Each `tools/*.ts` exports `tools: Tool[]` (definitions) and `handlers: Record<string, Handler>`,
where `Handler = (args: Record<string, unknown>) => Promise<CallToolResult>`. `index.ts` merges all
definitions and handler maps.

## 5. Naming & rename

| Item | Old | New |
|------|-----|-----|
| Project dir | `f:\projects\metrika-mcp` | `f:\projects\yandex-mcp` |
| Package name | `yandex-ads-mcp` (pyproject) | `yandex-mcp` (package.json) |
| Bin / npx name | — | `yandex-mcp` |
| MCP server identity | `"yandex-ads"` | `"yandex"` |
| Config directory | (new) | `~/.yandex-mcp/config.json` |

**Caveats (documented in README):** after the rename + stack change, the MCP client config entry
changes from `python …/server.py` to `node …/yandex-mcp/build/index.js`; the user updates it
manually. The directory move and Python-file removal are discrete, clearly-flagged plan steps.

## 6. Module: `auth.ts` + `config.ts` (single source of truth)

**`config.ts`** — `~/.yandex-mcp/config.json` load/save (`{ client_id, oauth_token, yc_folder_id }`).
Defensive: missing/corrupt file → empty object, never throws. `mkdir` on first write. Config-dir
path overridable via a parameter/env for tests.

**`auth.ts`** — live credential state + flow:
- `currentToken() / currentClientId() / currentFolderId(): string`
- `setToken(t) / setClientId(id) / setFolderId(f)` — update in-memory + persist via `config.ts`;
  `setToken`/`setClientId` also clear the cached IAM token so Wordstat re-derives it.
- `buildAuthorizeUrl(): string | null` — `https://oauth.yandex.ru/authorize?response_type=token&client_id=<id>`; `null` if no client_id.
- `validateToken(token, fetchImpl = fetch): Promise<boolean>` — `GET https://api-metrika.yandex.net/management/v1/counters?per_page=1`; 200 → true, 401/403 → false; other → throws "could not verify".
- `authRequiredPayload(reason): object` — structured gate response (see §8).
- `class AuthError extends Error` — auth failures, caught centrally.

**Resolution order (highest first):** in-memory (set this session) → config file → env seed.
**Env seed (read at startup):** `YD_OAUTH_TOKEN` (back-compat) → token; `YANDEX_OAUTH_CLIENT_ID`
(new) → client_id; `YC_FOLDER_ID` (back-compat) → folder_id.

## 7. Auth tools (3 new)

Non-mutating; exempt from `YD_READONLY`/`YD_CONFIRM` and from the auth-gate.

| Tool | Input | Behavior |
|------|-------|----------|
| `yd_auth_status` | — | Reports client_id set?, token present?, token valid? (live ping), folder_id set?, next-step hint. |
| `yd_set_client_id` | `client_id` (req) | Persists; returns the authorize URL + register instructions (scopes `direct:api`, `metrika:read`, `metrika:write`, `cloud:auth`; redirect = "Подставить URL для разработки"). |
| `yd_set_token` | `oauth_token` (req), `yc_folder_id` (opt) | Validates via live API call; on success persists (+folder_id); on failure returns error without persisting. |

## 8. Auth-gate behavior (the "auto-send link" core)

In the `CallToolRequestSchema` handler:

**Pre-flight** (non-auth tools): if `currentToken()` is empty → return `authRequiredPayload`:
- client_id **set** → include clickable `authorize_url` + "authorize, copy `access_token`, call `yd_set_token`".
- client_id **unset** → instructions to register app (`https://oauth.yandex.ru/client/new`, scopes) + call `yd_set_client_id`.

**Post-flight:** API layers throw `AuthError` on auth failure:
- Metrika fetch wrapper: HTTP 401/403 → `AuthError`.
- Direct `callApi`/`callApi501`: HTTP 401/403 or `error.error_code` in auth set (e.g. 53, 58) → `AuthError`.
The dispatcher catches `AuthError` → same `authRequiredPayload` (reason: "token invalid or expired").
Other errors keep the existing `Error: {msg}` text response.

**Payload shape** (pretty-JSON text content):
```json
{
  "authorization_required": true,
  "reason": "No OAuth token configured",
  "authorize_url": "https://oauth.yandex.ru/authorize?response_type=token&client_id=...",
  "next_step": "Open authorize_url, approve access, copy access_token from the redirect page, then call yd_set_token with it.",
  "register_app_url": "https://oauth.yandex.ru/client/new",
  "required_scopes": ["direct:api", "metrika:read", "metrika:write", "cloud:auth"]
}
```
(`authorize_url` omitted + `next_step` adjusted when client_id missing.)

**Startup:** `main()` logs a warning when no token is configured and starts normally (auth tools
reachable); it never exits on missing credentials.

## 9. Dynamic token

All handlers resolve the token at call time via `auth.currentToken()` (no import-time capture), so
`yd_set_token` takes effect immediately. The IAM cache is cleared on token/client_id change so
Wordstat re-derives IAM from the new OAuth token.

## 10. Safety wrapper (ported)

Port the existing safety protections with identical behavior and **same env var names** (back-compat):
`YD_READONLY`, `YD_CONFIRM`, `YD_ALLOWED_LOGINS` (Direct multi-account whitelist + per-call
`client_login`), `YD_SANDBOX`, `YD_LOGIN`, logging envs (`YD_LOG_LEVEL`/`YD_LOG_FILE`/`YD_LOG_BODIES`,
default: no file on disk), and the Direct partial-success annotation. Mutating-tool classification
(`_isMutating`) and Direct-vs-Metrika classification (`_isDirect`) ported. Auth tools are
non-mutating.

## 11. OAuth specifics

- **Register:** `https://oauth.yandex.ru/client/new`; scopes `direct:api`, `metrika:read`,
  `metrika:write`, `cloud:auth`; redirect "Подставить URL для разработки"
  (`https://oauth.yandex.ru/verification_code`).
- **Authorize (implicit):** `https://oauth.yandex.ru/authorize?response_type=token&client_id=<id>`;
  user copies `access_token` from the verification page into `yd_set_token`.

## 12. Testing (`test/safety.test.ts`, `node:test`, offline)

- Mutating classification (sample Direct/Metrika mutating + read tools); **auth tools non-mutating**.
- Direct-vs-Metrika/Wordstat classification.
- `buildAuthorizeUrl()` correct for a client_id, `null` when unset.
- Credential persistence round-trip against a **temp** config dir (override config path):
  set/get for client_id & token; missing/corrupt file → empty state.
- Resolution order: env seed when no file; file overrides env; in-memory overrides file.
- `authRequiredPayload` shape: `authorize_url` present when client_id set; absent + points to
  `yd_set_client_id` when unset.
- `validateToken` with an injected fake fetch (200 → true, 401 → false); no real network.
- `iamExpiry` parsing (ISO `Z`, nanosecond precision, fallbacks) — ported from the Python test.

## 13. Parity & porting strategy

- Port module-by-module; keep the Python files present as reference until parity is confirmed.
- **Parity check (plan step):** assert the Node `ListTools` output has the same tool **count** and
  the same set of tool **names** as the Python server (the Python `README` table + source are the
  reference: 120 existing + 3 new auth = 123). Spot-check a few representative input schemas match.
- Once parity passes and `node:test` is green, **remove** `server.py`, `tools_metrika.py`,
  `tools_direct_extra.py`, `test_safety.py`, `requirements.txt`, `pyproject.toml`.

## 14. Docs

- **README.md:** rewrite for Node — install (`npm i`/`npm run build`), MCP client config snippet
  (`node …/yandex-mcp/build/index.js`), the auth flow (register → `yd_set_client_id` → link →
  `yd_set_token`), `~/.yandex-mcp/config.json` as source of truth, env table
  (`YD_OAUTH_TOKEN`/`YANDEX_OAUTH_CLIENT_ID`/`YC_FOLDER_ID` + safety/logging envs). Keep the full
  tool tables. **Clean new-project identity:** no fork/upstream attribution, no "доработки форка"
  section, no mention of the old `metrika-mcp`/`yandex-ads-mcp` names.
- **.env.example:** add `YANDEX_OAUTH_CLIENT_ID`; note all credentials optional (server starts and
  guides via tools); keep safety/logging vars.
- **package.json / tsconfig.json:** new.
- **Git:** detach from the upstream repo — remove the `origin` remote (`Yurich-ru/yandex-ads-mcp`),
  since this is a standalone new project.

## 15. Backward compatibility

- `YD_OAUTH_TOKEN`, `YC_FOLDER_ID`, and all `YD_*` safety/logging env vars keep working (seeds).
- All tool names unchanged → existing agent prompts keep working.
- Breaking: launch command (`python server.py` → `node build/index.js`) and folder path — both
  documented manual updates to the MCP client config.

## 16. Open questions

None — stack (Node/TS, MCP SDK low-level `Server`, JSON Schema, `node:test`), naming
(`yandex-mcp`), folder rename (yes), Python removal after parity, auth flow (implicit link +
`yd_set_token`), client_id source (user-supplied), and credential storage
(`~/.yandex-mcp/config.json`) are resolved.

## 17. Addendum — Yandex Webmaster API (added during build)

A fourth service was added: **Yandex Webmaster API v4** (`src/tools/webmaster.ts`, 30 tools,
`yd_webmaster_*`). This raises the total to **153 tools** (3 auth + 46 Direct core + 26 Direct
extra + 5 Wordstat + 43 Metrika + 30 Webmaster).

- **Client:** `webmasterFetch(method, subpath, {params, body})` + `getWebmasterUserId()` in
  `yandexApi.ts`. Base `https://api.webmaster.yandex.net/v4`; `OAuth <token>` header; the `user_id`
  is resolved once from `GET /v4/user/` and cached by OAuth token; subpaths are auto-prefixed with
  `/user/{user_id}`. Array query params (e.g. `query_indicator`) are sent as **repeated** params.
  401/403 → `AuthError`; 204 → `{success:true}`; other ≥400 → `Error`.
- **Scopes:** `REQUIRED_SCOPES` gains `webmaster:hostview` and `webmaster:verify` (now 6 scopes).
- **Classification:** `isDirect()` also excludes `yd_webmaster_*` (these don't use Client-Login).
- **Coverage:** hosts (list/add/get/delete), summary, verification (get/start), owners,
  diagnostics, SQI history, sitemaps (+ user-added CRUD), indexing (history/samples), in-search &
  search-events, search queries (popular + history), external & broken links, recrawl
  (submit/list/task/quota), important URLs.

## 18. Addendum — final name

This document uses the working name `yandex-mcp` throughout. The project **shipped as
`yandex-marketing-mcp`** (the umbrella for Direct + Metrika + Wordstat + Webmaster): package name
`yandex-marketing-mcp`, server identity `yandex-marketing`, config dir `~/.yandex-marketing-mcp/`,
directory `f:\projects\yandex-marketing-mcp`. Mentions of `yandex-mcp`/`yandex` above should be read
as `yandex-marketing-mcp`/`yandex-marketing`.
