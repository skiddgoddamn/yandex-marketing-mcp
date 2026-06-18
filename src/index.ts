#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolDef, Handler } from "./types.js";
import { text } from "./types.js";
import { initAuth, currentToken, AuthError, authRequiredPayload, AUTH_TOOLS, authHandlers } from "./auth.js";
import { metrikaTools, metrikaHandlers } from "./tools/metrika.js";
import { directCoreTools, directCoreHandlers } from "./tools/directCore.js";
import { directExtraTools, directExtraHandlers } from "./tools/directExtra.js";
import { wordstatTools, wordstatHandlers } from "./tools/wordstat.js";
import { webmasterTools, webmasterHandlers } from "./tools/webmaster.js";
import { log } from "./log.js";

const READONLY = (process.env.YD_READONLY || "").toLowerCase() === "true";
const CONFIRM = (process.env.YD_CONFIRM || "").toLowerCase() === "true";
const ALLOWED_LOGINS = (process.env.YD_ALLOWED_LOGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
const LOGIN = process.env.YD_LOGIN || "";

// Seed auth state on module import so dispatch tests work without calling main().
initAuth();

const MUTATING_TOKENS = ["_add", "_create", "_update", "_delete", "_action", "_set", "_toggle", "_link", "_unlink", "_upload", "_start", "_submit"];
const AUTH_TOOL_NAMES = new Set(AUTH_TOOLS.map((t) => t.name));

export function isMutating(name: string): boolean {
  if (AUTH_TOOL_NAMES.has(name)) return false;
  return MUTATING_TOKENS.some((t) => name.includes(t));
}

export function isDirect(name: string): boolean {
  return name.startsWith("yd_") && !name.startsWith("yd_metrika") && !name.startsWith("yd_wordstat") && !name.startsWith("yd_webmaster");
}

export const ALL_TOOLS: ToolDef[] = [...AUTH_TOOLS];
export const HANDLERS: Record<string, Handler> = { ...authHandlers };
registerTools(metrikaTools, metrikaHandlers);
registerTools(directCoreTools, directCoreHandlers);
registerTools(directExtraTools, directExtraHandlers);
registerTools(wordstatTools, wordstatHandlers);
registerTools(webmasterTools, webmasterHandlers);

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

const server = new Server({ name: "yandex-marketing", version: "2.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: ALL_TOOLS.map(augment) }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  return dispatch(name, args as Record<string, unknown>);
});

export async function main(): Promise<void> {
  initAuth();
  if (!currentToken()) log.warning("No OAuth token configured yet — use yd_set_client_id then yd_set_token. Server starting anyway.");
  log.info(`Starting yandex-marketing MCP server (tools=${ALL_TOOLS.length})`);
  await server.connect(new StdioServerTransport());
}

// Cross-platform direct-run guard (Windows-safe: process.argv[1] uses backslashes,
// import.meta.url uses file:///F:/... forward slashes — pathToFileURL normalises both).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
