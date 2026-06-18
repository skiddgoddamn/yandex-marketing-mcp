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
