import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type ToolDef = Tool;
export interface ToolContext { clientLogin: string; }
export type Handler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<CallToolResult>;

export function text(data: unknown): CallToolResult {
  const body = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text: body }] };
}
