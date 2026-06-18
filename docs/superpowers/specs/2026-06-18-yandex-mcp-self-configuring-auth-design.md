# yandex-mcp — Self-configuring OAuth + project rename

**Date:** 2026-06-18
**Status:** Approved design, pending spec review
**Scope:** Single implementation plan

## 1. Context

The project at `f:\projects\metrika-mcp` is a fork of `Yurich-ru/yandex-ads-mcp`. It is a
**stdio** MCP server exposing 120 tools across three Yandex services:

- **Yandex Direct** (77 tools) — `server.py` inline `TOOLS` + `tools_direct_extra.py`
- **Yandex Metrika** (43 tools) — `tools_metrika.py` (self-contained)
- **Wordstat** (Cloud Search API, IAM token) — `server.py` + `tools_direct_extra.py`

Today authentication is a single env var `YD_OAUTH_TOKEN`, read once at import time. If it is
missing, `main()` calls `sys.exit(1)` and the server refuses to start. There is **no
token-acquisition flow** — the user must manually register a Yandex OAuth app, get a token, paste
it into the MCP client config, and restart. There is no graceful handling of an expired/invalid
token at call time either.

One OAuth token serves **both Direct and Metrika** (`Bearer`/`OAuth` header against their
respective hosts); Wordstat derives an **IAM token** from the same OAuth token and additionally
needs `YC_FOLDER_ID`.

## 2. Goals

1. **Self-configuring auth.** When a tool is called without a valid token, the server returns a
   structured "authorization required" response containing a **clickable Yandex OAuth link**, so
   the agent can relay it to the user. After the user authorizes and copies the token, a
   `yd_set_token` tool persists it — **no client restart required**.
2. **User-supplied client_id.** No client_id is baked in. The user registers their own Yandex
   OAuth app; the server requests the `client_id` (via `yd_set_client_id`) and persists it.
3. **Keep all three services.** Direct + Metrika + Wordstat all remain. No tools are deleted and
   no tool names change (`yd_*`, `yd_metrika_*`, `yd_wordstat_*` stay).
4. **Rename the project** from the misleading `metrika-mcp` to **`yandex-mcp`** (it covers all
   three services), including a physical directory rename.
5. **Server no longer hard-exits** on a missing token; it starts and guides the user via tool
   responses.

## 3. Non-goals (YAGNI)

- No full OAuth authorization-code / loopback-callback flow (implicit flow only — chosen by user).
- No multi-user / per-session token storage (single local credential store).
- No renaming of tool identifiers (`yd_metrika_*` → `metrika_*`) — explicitly kept as-is.
- No automatic browser opening; the link is returned as text in the tool response.
- No automatic rewriting of the MCP client config path after the folder rename (user does this).

## 4. Naming & rename

| Item | Old | New |
|------|-----|-----|
| Project dir | `f:\projects\metrika-mcp` | `f:\projects\yandex-mcp` |
| `pyproject.toml` name | `yandex-ads-mcp` | `yandex-mcp` |
| Console script | `yandex-ads-mcp` | `yandex-mcp` |
| MCP server identity | `Server("yandex-ads")` | `Server("yandex")` |
| Logger name | `yandex-ads-mcp` | `yandex-mcp` |
| Config directory | (new) | `~/.yandex-mcp/config.json` |

**Folder rename caveat (documented in README):** the user must update the path to `server.py` in
their MCP client config (e.g. `~/.claude.json` `mcpServers`) after the rename. The implementation
plan will perform the directory move as a discrete, clearly-flagged step.

## 5. New module: `auth.py`

A single source of truth for credentials and the OAuth link flow. Pure, isolated, independently
testable.

**State:** `{ client_id, oauth_token, yc_folder_id }`.

**Public surface:**
- `current_token() -> str`
- `current_client_id() -> str`
- `current_folder_id() -> str`
- `set_token(token: str) -> None` — persists to config file, updates in-memory state
- `set_client_id(client_id: str) -> None` — persists, updates state
- `set_folder_id(folder_id: str) -> None` — persists, updates state
- `build_authorize_url() -> str | None` — `https://oauth.yandex.ru/authorize?response_type=token&client_id=<id>`; `None` if no client_id
- `auth_required_payload(reason: str) -> dict` — the structured response the gate returns (see §7)
- `validate_token(client, token) -> bool` — lightweight live check (see §7)
- `class AuthError(Exception)` — raised on 401/403/auth-code failures, caught centrally

### 5.1 Credential resolution & persistence

- **Store:** `~/.yandex-mcp/config.json` — JSON `{ "client_id": "...", "oauth_token": "...", "yc_folder_id": "..." }`.
- **Resolution order (highest first):** in-memory (set this session) → config file → env seed.
- **Env seed (read at startup):**
  - `YD_OAUTH_TOKEN` (kept for backward compatibility) → `oauth_token`
  - `YANDEX_OAUTH_CLIENT_ID` (new) → `client_id`
  - `YC_FOLDER_ID` (kept) → `yc_folder_id`
- **Writes** go to the config file (a stdio process cannot rewrite its own launch env). README
  documents the config file as the source of truth and env vars as the seed/override.
- Config dir is created on first write (`Path.home() / ".yandex-mcp"`, `mkdir(parents=True, exist_ok=True)`).
- Read/write are defensive: a missing/corrupt config file is treated as empty, never fatal.

## 6. Auth tools (3 new)

All three are **non-mutating** (never blocked by `YD_READONLY`) and bypass the auth-gate
(calling them is how you *fix* auth).

| Tool | Input | Behavior |
|------|-------|----------|
| `yd_auth_status` | — | Reports: client_id set?, token present?, token valid? (live ping), folder_id set? Returns next-step hint. |
| `yd_set_client_id` | `client_id` (req) | Persists client_id; returns the ready authorize URL + instructions (register app with scopes `direct:api`, `metrika:read`, `metrika:write`, `cloud:auth`; redirect URI = "Подставить URL для разработки"). |
| `yd_set_token` | `oauth_token` (req), `yc_folder_id` (opt) | Validates the token via a live API call; on success persists it (and folder_id if given) and returns success; on failure returns an error without persisting. |

## 7. Auth-gate behavior (the "auto-send link" core)

In the central `call_tool` dispatcher:

**Pre-flight** (before dispatching any non-auth tool):
- If `current_token()` is empty → return `auth_required_payload`:
  - If `client_id` **is** set → include the clickable authorize URL + "authorize, copy the
    `access_token`, then call `yd_set_token`".
  - If `client_id` **is not** set → instructions to register a Yandex OAuth app (link to
    `https://oauth.yandex.ru/client/new`, required scopes) and call `yd_set_client_id`.

**Post-flight** (after dispatch):
- API layers raise `AuthError` on auth failures:
  - Metrika `_metrika_api`: HTTP 401/403 → `AuthError`.
  - Direct `_api` / `_api501`: HTTP 401/403, or `error.error_code` in the auth set (e.g. 53, 58) → `AuthError`.
- The dispatcher catches `AuthError` and returns the same `auth_required_payload` (reason:
  "token invalid or expired — re-authorize"). Non-auth exceptions keep the existing
  `Error: {e}` behavior.

**Payload shape** (returned as pretty JSON `TextContent`):
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
(`authorize_url` omitted and `next_step` adjusted when client_id is missing.)

**Token validation (`validate_token`):** `GET https://api-metrika.yandex.net/management/v1/counters?per_page=1`
with the candidate token. HTTP 200 → valid; 401/403 → invalid; other statuses → treat as
"could not verify" (do not block persistence in `yd_set_token`, but surface a warning). This uses
Metrika because it is the lowest-friction read and the token is shared.

**Startup:** `main()` no longer `sys.exit(1)` on empty token. It logs a warning ("no token yet —
use yd_set_client_id / yd_set_token") and starts normally so the auth tools are reachable.

## 8. Dynamic-token refactor

The token can now change at runtime (`yd_set_token`), so no module may capture it at import time.

- `server._headers()` → reads `auth.current_token()`.
- Wordstat IAM (`_get_iam_token`) → uses `auth.current_token()`.
- `_extra_config` → **rebuilt per call** inside `_dispatch` from `auth` (token + folder_id) instead
  of being fixed at module load. `base_url`/`login` unchanged.
- `register_metrika_handlers(dispatch, token_provider)` → accepts a **callable** instead of a
  static token; `tools_metrika._metrika_api` resolves the current token via the provider on each
  call. (`_crud_*` helpers updated to thread the provider, or `tools_metrika` imports `auth`
  directly — implementation detail for the plan.)
- The shared IAM cache stays valid because the OAuth→IAM exchange re-runs when the cache expires;
  on token change we also clear the IAM cache so a new OAuth token re-derives IAM.

## 9. Safety wrapper (kept)

`YD_READONLY`, `YD_CONFIRM`, `YD_ALLOWED_LOGINS`, logging envs and the partial-success annotation
all remain unchanged in behavior. The three auth tools are classified non-mutating and are exempt
from READONLY/CONFIRM and from the auth-gate. (Env var names stay `YD_*` for backward compat.)

## 10. OAuth specifics

- **App registration:** user creates an app at `https://oauth.yandex.ru/client/new`, ticks scopes
  `direct:api`, `metrika:read`, `metrika:write`, `cloud:auth`, chooses redirect "Подставить URL
  для разработки" (`https://oauth.yandex.ru/verification_code`).
- **Authorize (implicit):** `https://oauth.yandex.ru/authorize?response_type=token&client_id=<id>`.
  After approval, Yandex shows the `access_token` on the verification page; the user pastes it into
  `yd_set_token`.

## 11. Testing (`test_safety.py`, offline, no network)

Extend the existing offline smoke test:
- Mutating classification unchanged; **auth tools classified non-mutating**
  (`yd_auth_status`, `yd_set_client_id`, `yd_set_token`).
- `auth.build_authorize_url()` returns the correct URL for a given client_id, and `None` when unset.
- Credential persistence round-trips against a **temp** config path (monkeypatch the config dir):
  `set_client_id`/`set_token` write and re-read correctly; missing/corrupt file → empty state.
- Resolution order: env seed picked up when no file; file overrides env; in-memory set overrides file.
- `auth_required_payload` shape: includes `authorize_url` when client_id set; omits it and points to
  `yd_set_client_id` when not.
- `validate_token` logic tested with a mocked httpx client (200 → True, 401 → False), no real network.
- Existing IAM `expiresAt` parsing tests retained.

## 12. Docs

- **README.md:** new "Самонастройка / авторизация" section — register app → `yd_set_client_id`
  (get link) → authorize → `yd_set_token`; document `~/.yandex-mcp/config.json` as source of truth,
  `YANDEX_OAUTH_CLIENT_ID` env, and the folder-rename path-update caveat. Update project name/title
  to `yandex-mcp`. Update the env table.
- **.env.example:** add `YANDEX_OAUTH_CLIENT_ID`; clarify all credentials are optional now (server
  starts without them and guides via tools). Keep `YD_OAUTH_TOKEN`/`YC_FOLDER_ID`.
- **pyproject.toml:** name + console script → `yandex-mcp`.

## 13. Backward compatibility

- `YD_OAUTH_TOKEN` and `YC_FOLDER_ID` still read as seeds → existing setups keep working.
- All tool names unchanged → existing agent prompts/configs keep working.
- Only the folder path and project/server identity change (path update is a documented manual step).

## 14. File-by-file change summary

- **`auth.py`** (new) — credential store, persistence, link building, validation, `AuthError`,
  auth-tool handlers + Tool defs.
- **`server.py`** — import auth; remove import-time `TOKEN` dependence in `_headers`/IAM; rebuild
  `_extra_config` per call; add auth Tool defs to `list_tools`; add auth-gate + `AuthError` catch
  in `call_tool`/`_dispatch`; register auth handlers; `main()` no longer exits on empty token;
  rename server identity + logger.
- **`tools_metrika.py`** — `register_metrika_handlers(dispatch, token_provider)`; `_metrika_api`
  raises `AuthError` on 401/403 and resolves token dynamically.
- **`tools_direct_extra.py`** — `_api`/`_api501` raise `AuthError` on auth failures; clear IAM cache
  helper on token change.
- **`test_safety.py`** — new/updated offline tests (§11).
- **`README.md`, `.env.example`, `pyproject.toml`** — rename + auth docs.
- **Directory** — `metrika-mcp` → `yandex-mcp` (discrete plan step).

## 15. Open questions

None — naming (`yandex-mcp`), folder rename (yes), auth flow (link + `yd_set_token`),
client_id source (user-supplied), and credential storage (`~/.yandex-mcp/config.json`) are all
resolved.
