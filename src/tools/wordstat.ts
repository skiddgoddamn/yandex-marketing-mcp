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
    method: "POST",
    headers: { Authorization: `Bearer ${iam}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (resp.status === 429) throw new Error("Wordstat rate limit exceeded (429). Retry later.");
  if (resp.status === 503) throw new Error("Wordstat global quota exceeded (503).");
  if (resp.status !== 200) throw new Error(`Wordstat error ${resp.status}: ${(await resp.text()).slice(0, 500)}`);
  return resp.json();
}

export const wordstatTools: ToolDef[] = [
  {
    name: "yd_wordstat_top_requests",
    description: "Get popular search queries containing a keyword from Yandex Wordstat (last 30 days). Returns phrases with search counts. 1 quota unit per request.",
    inputSchema: {
      type: "object",
      properties: {
        phrase: { type: "string", description: "Keyword to analyze" },
        num_phrases: { type: "integer", description: "How many related phrases to return, 1-2000 (default 30)" },
        regions: { type: "array", items: { type: "integer" }, description: "Region IDs (optional, omit for all Russia)" },
        devices: { type: "string", enum: ["all", "desktop", "phone", "tablet"], description: "Device filter (default: all)" },
      },
      required: ["phrase"],
    },
  },
  {
    name: "yd_wordstat_dynamics",
    description: "Get search frequency dynamics over time for a keyword. Date alignment is enforced by the API: monthly → both dates must be the 1st of a month; weekly → from=Monday, to=Sunday; daily → any dates.",
    inputSchema: {
      type: "object",
      properties: {
        phrase: { type: "string", description: "Keyword to analyze" },
        period: { type: "string", enum: ["monthly", "weekly", "daily"], description: "Time granularity" },
        from_date: { type: "string", description: "Start date YYYY-MM-DD (monthly: 1st of month; weekly: a Monday)" },
        to_date: { type: "string", description: "End date YYYY-MM-DD (monthly: 1st of month; weekly: a Sunday)" },
        regions: { type: "array", items: { type: "integer" }, description: "Region IDs (optional)" },
        devices: { type: "string", enum: ["all", "desktop", "phone", "tablet"] },
      },
      required: ["phrase", "period", "from_date", "to_date"],
    },
  },
  {
    name: "yd_wordstat_regions",
    description: "Get regional distribution of search queries for a keyword. Shows which regions search most. 2 quota units.",
    inputSchema: {
      type: "object",
      properties: {
        phrase: { type: "string", description: "Keyword to analyze" },
        region_type: { type: "string", enum: ["cities", "regions", "all"], description: "Granularity level" },
        devices: { type: "string", enum: ["all", "desktop", "phone", "tablet"] },
      },
      required: ["phrase"],
    },
  },
  {
    name: "yd_wordstat_regions_tree",
    description: "Get the full tree of Wordstat-supported regions with IDs. No quota cost. Use to find region IDs for other Wordstat methods.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "yd_wordstat_user_info",
    description: "Get Wordstat API quota info (uses IAM token).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
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
    const body: Record<string, unknown> = {
      phrase: args.phrase,
      period: PERIODS[String(args.period)] ?? args.period,
      fromDate: rfc3339(String(args.from_date)),
      toDate: rfc3339(String(args.to_date)),
    };
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
  async yd_wordstat_regions_tree() {
    return text(await wordstatRequest("/getRegionsTree", {}));
  },
  async yd_wordstat_user_info() {
    const iam = await getIamToken();
    const resp = await fetch("https://searchapi.api.cloud.yandex.net/v2/wordstat/userInfo", {
      method: "POST",
      headers: { Authorization: `Bearer ${iam}`, "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: currentFolderId() }),
    });
    if (resp.status !== 200) throw new Error(`Wordstat userInfo error ${resp.status}: ${(await resp.text()).slice(0, 500)}`);
    return text(await resp.json());
  },
};
