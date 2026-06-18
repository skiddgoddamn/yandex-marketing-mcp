import { getWebmasterUserId, webmasterFetch } from "../yandexApi.js";
import { text } from "../types.js";
import type { ToolDef, Handler } from "../types.js";

export const webmasterTools: ToolDef[] = [
  {
    name: "yd_webmaster_user_get",
    description: "Yandex Webmaster: get current authenticated user info (user_id).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "yd_webmaster_hosts_get",
    description: "Yandex Webmaster: list all verified and unverified hosts for the user.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "yd_webmaster_host_add",
    description: "Yandex Webmaster: add a new host for verification.",
    inputSchema: {
      type: "object",
      properties: {
        host_url: { type: "string", description: "Host URL to add (e.g. https://example.com)" },
      },
      required: ["host_url"],
    },
  },
  {
    name: "yd_webmaster_host_get",
    description: "Yandex Webmaster: get details of a specific host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
      },
      required: ["host_id"],
    },
  },
  {
    name: "yd_webmaster_host_delete",
    description: "Yandex Webmaster: delete (unregister) a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
      },
      required: ["host_id"],
    },
  },
  {
    name: "yd_webmaster_host_summary",
    description: "Yandex Webmaster: get host summary including SQI and problem counts.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
      },
      required: ["host_id"],
    },
  },
  {
    name: "yd_webmaster_verification_get",
    description: "Yandex Webmaster: get verification status for a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
      },
      required: ["host_id"],
    },
  },
  {
    name: "yd_webmaster_verification_start",
    description: "Yandex Webmaster: start host verification with a specified method.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
        verification_type: {
          type: "string",
          enum: ["DNS_DELEGATION", "HTML_FILE", "META_TAG", "WHOIS", "TXT_FILE", "PUBLIC_KEY", "DNS_TXT"],
          description: "Verification method",
        },
      },
      required: ["host_id", "verification_type"],
    },
  },
  {
    name: "yd_webmaster_owners_get",
    description: "Yandex Webmaster: list owners of a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
      },
      required: ["host_id"],
    },
  },
  {
    name: "yd_webmaster_diagnostics_get",
    description: "Yandex Webmaster: get site diagnostics and problems for a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
      },
      required: ["host_id"],
    },
  },
  {
    name: "yd_webmaster_sqi_history",
    description: "Yandex Webmaster: get SQI (Site Quality Index) history for a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
        date_from: { type: "string", description: "Start date YYYY-MM-DD" },
        date_to: { type: "string", description: "End date YYYY-MM-DD" },
      },
      required: ["host_id"],
    },
  },
  {
    name: "yd_webmaster_sitemaps_get",
    description: "Yandex Webmaster: get sitemaps known to Yandex for a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
        parent_id: { type: "string", description: "Parent sitemap ID filter" },
        limit: { type: "integer", description: "Max items to return" },
        from: { type: "string", description: "Pagination cursor" },
      },
      required: ["host_id"],
    },
  },
  {
    name: "yd_webmaster_user_sitemaps_get",
    description: "Yandex Webmaster: get user-added sitemaps for a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
        limit: { type: "integer", description: "Max items to return" },
        from: { type: "string", description: "Pagination cursor" },
      },
      required: ["host_id"],
    },
  },
  {
    name: "yd_webmaster_user_sitemap_add",
    description: "Yandex Webmaster: add a sitemap URL for a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
        url: { type: "string", description: "Sitemap URL to add" },
      },
      required: ["host_id", "url"],
    },
  },
  {
    name: "yd_webmaster_user_sitemap_delete",
    description: "Yandex Webmaster: delete a user-added sitemap for a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
        sitemap_id: { type: "string", description: "Sitemap ID to delete" },
      },
      required: ["host_id", "sitemap_id"],
    },
  },
  {
    name: "yd_webmaster_indexing_history",
    description: "Yandex Webmaster: get crawled-pages indexing history for a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
        date_from: { type: "string", description: "Start date YYYY-MM-DD" },
        date_to: { type: "string", description: "End date YYYY-MM-DD" },
      },
      required: ["host_id"],
    },
  },
  {
    name: "yd_webmaster_indexing_samples",
    description: "Yandex Webmaster: get sample indexed pages for a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
        offset: { type: "integer", description: "Pagination offset" },
        limit: { type: "integer", description: "Max items to return" },
      },
      required: ["host_id"],
    },
  },
  {
    name: "yd_webmaster_insearch_history",
    description: "Yandex Webmaster: get history of pages in search for a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
        date_from: { type: "string", description: "Start date YYYY-MM-DD" },
        date_to: { type: "string", description: "End date YYYY-MM-DD" },
      },
      required: ["host_id"],
    },
  },
  {
    name: "yd_webmaster_insearch_samples",
    description: "Yandex Webmaster: get sample pages currently in search for a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
        offset: { type: "integer", description: "Pagination offset" },
        limit: { type: "integer", description: "Max items to return" },
      },
      required: ["host_id"],
    },
  },
  {
    name: "yd_webmaster_search_events_samples",
    description: "Yandex Webmaster: get sample pages added or removed from search for a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
        offset: { type: "integer", description: "Pagination offset" },
        limit: { type: "integer", description: "Max items to return" },
      },
      required: ["host_id"],
    },
  },
  {
    name: "yd_webmaster_search_queries_popular",
    description: "Yandex Webmaster: get popular search queries for a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
        order_by: { type: "string", enum: ["TOTAL_SHOWS", "TOTAL_CLICKS"], description: "Sort indicator" },
        query_indicator: {
          type: "array",
          items: { type: "string" },
          description: "Metrics: TOTAL_SHOWS, TOTAL_CLICKS, AVG_SHOW_POSITION, AVG_CLICK_POSITION, CTR",
        },
        device_type_indicator: {
          type: "string",
          enum: ["ALL", "DESKTOP", "MOBILE", "MOBILE_AND_TABLET", "TABLET"],
          description: "Device type filter",
        },
        date_from: { type: "string", description: "Start date YYYY-MM-DD" },
        date_to: { type: "string", description: "End date YYYY-MM-DD" },
        offset: { type: "integer", description: "Pagination offset" },
        limit: { type: "integer", description: "Max items to return" },
      },
      required: ["host_id"],
    },
  },
  {
    name: "yd_webmaster_search_queries_history",
    description: "Yandex Webmaster: get aggregated search queries history for a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
        query_indicator: {
          type: "array",
          items: { type: "string" },
          description: "Metrics: TOTAL_SHOWS, TOTAL_CLICKS, AVG_SHOW_POSITION, AVG_CLICK_POSITION, CTR",
        },
        date_from: { type: "string", description: "Start date YYYY-MM-DD" },
        date_to: { type: "string", description: "End date YYYY-MM-DD" },
        device_type_indicator: {
          type: "string",
          enum: ["ALL", "DESKTOP", "MOBILE", "MOBILE_AND_TABLET", "TABLET"],
          description: "Device type filter",
        },
      },
      required: ["host_id"],
    },
  },
  {
    name: "yd_webmaster_external_links_samples",
    description: "Yandex Webmaster: get sample external backlinks for a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
        offset: { type: "integer", description: "Pagination offset" },
        limit: { type: "integer", description: "Max items to return" },
      },
      required: ["host_id"],
    },
  },
  {
    name: "yd_webmaster_external_links_history",
    description: "Yandex Webmaster: get external links count history for a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
        indicator: {
          type: "string",
          enum: ["LINKS_TOTAL_COUNT", "LINKS_NEW_COUNT", "LINKS_DEATH_COUNT"],
          description: "Links metric indicator",
        },
        date_from: { type: "string", description: "Start date YYYY-MM-DD" },
        date_to: { type: "string", description: "End date YYYY-MM-DD" },
      },
      required: ["host_id"],
    },
  },
  {
    name: "yd_webmaster_broken_links_samples",
    description: "Yandex Webmaster: get sample broken internal links for a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
        offset: { type: "integer", description: "Pagination offset" },
        limit: { type: "integer", description: "Max items to return" },
      },
      required: ["host_id"],
    },
  },
  {
    name: "yd_webmaster_recrawl_submit",
    description: "Yandex Webmaster: submit a URL for recrawl (returns task_id).",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
        url: { type: "string", description: "URL to recrawl" },
      },
      required: ["host_id", "url"],
    },
  },
  {
    name: "yd_webmaster_recrawl_list",
    description: "Yandex Webmaster: list recrawl queue tasks for a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
        offset: { type: "integer", description: "Pagination offset" },
        limit: { type: "integer", description: "Max items to return" },
        date_from: { type: "string", description: "Start date YYYY-MM-DD" },
        date_to: { type: "string", description: "End date YYYY-MM-DD" },
      },
      required: ["host_id"],
    },
  },
  {
    name: "yd_webmaster_recrawl_task",
    description: "Yandex Webmaster: get status of a specific recrawl task.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
        task_id: { type: "string", description: "Recrawl task ID (from yd_webmaster_recrawl_submit)" },
      },
      required: ["host_id", "task_id"],
    },
  },
  {
    name: "yd_webmaster_recrawl_quota",
    description: "Yandex Webmaster: get daily recrawl quota for a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
      },
      required: ["host_id"],
    },
  },
  {
    name: "yd_webmaster_important_urls",
    description: "Yandex Webmaster: get monitored important pages for a host.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: { type: "string", description: "Host ID (from yd_webmaster_hosts_get)" },
      },
      required: ["host_id"],
    },
  },
];

export const webmasterHandlers: Record<string, Handler> = {
  async yd_webmaster_user_get() {
    const userId = await getWebmasterUserId();
    return text({ user_id: Number(userId) });
  },
  async yd_webmaster_hosts_get() {
    return text(await webmasterFetch("get", "/hosts/"));
  },
  async yd_webmaster_host_add(args) {
    return text(await webmasterFetch("post", "/hosts/", { body: { host_url: args.host_url } }));
  },
  async yd_webmaster_host_get(args) {
    const h = encodeURIComponent(String(args.host_id));
    return text(await webmasterFetch("get", `/hosts/${h}/`));
  },
  async yd_webmaster_host_delete(args) {
    const h = encodeURIComponent(String(args.host_id));
    return text(await webmasterFetch("delete", `/hosts/${h}/`));
  },
  async yd_webmaster_host_summary(args) {
    const h = encodeURIComponent(String(args.host_id));
    return text(await webmasterFetch("get", `/hosts/${h}/summary/`));
  },
  async yd_webmaster_verification_get(args) {
    const h = encodeURIComponent(String(args.host_id));
    return text(await webmasterFetch("get", `/hosts/${h}/verification/`));
  },
  async yd_webmaster_verification_start(args) {
    const h = encodeURIComponent(String(args.host_id));
    return text(await webmasterFetch("post", `/hosts/${h}/verification/`, { params: { verification_type: args.verification_type } }));
  },
  async yd_webmaster_owners_get(args) {
    const h = encodeURIComponent(String(args.host_id));
    return text(await webmasterFetch("get", `/hosts/${h}/owners/`));
  },
  async yd_webmaster_diagnostics_get(args) {
    const h = encodeURIComponent(String(args.host_id));
    return text(await webmasterFetch("get", `/hosts/${h}/diagnostics/`));
  },
  async yd_webmaster_sqi_history(args) {
    const h = encodeURIComponent(String(args.host_id));
    const params: Record<string, unknown> = {};
    for (const k of ["date_from", "date_to"]) if (args[k] !== undefined) params[k] = args[k];
    return text(await webmasterFetch("get", `/hosts/${h}/sqi_history/`, { params }));
  },
  async yd_webmaster_sitemaps_get(args) {
    const h = encodeURIComponent(String(args.host_id));
    const params: Record<string, unknown> = {};
    for (const k of ["parent_id", "limit", "from"]) if (args[k] !== undefined) params[k] = args[k];
    return text(await webmasterFetch("get", `/hosts/${h}/sitemaps/`, { params }));
  },
  async yd_webmaster_user_sitemaps_get(args) {
    const h = encodeURIComponent(String(args.host_id));
    const params: Record<string, unknown> = {};
    for (const k of ["limit", "from"]) if (args[k] !== undefined) params[k] = args[k];
    return text(await webmasterFetch("get", `/hosts/${h}/user-added-sitemaps/`, { params }));
  },
  async yd_webmaster_user_sitemap_add(args) {
    const h = encodeURIComponent(String(args.host_id));
    return text(await webmasterFetch("post", `/hosts/${h}/user-added-sitemaps/`, { body: { url: args.url } }));
  },
  async yd_webmaster_user_sitemap_delete(args) {
    const h = encodeURIComponent(String(args.host_id));
    const s = encodeURIComponent(String(args.sitemap_id));
    return text(await webmasterFetch("delete", `/hosts/${h}/user-added-sitemaps/${s}/`));
  },
  async yd_webmaster_indexing_history(args) {
    const h = encodeURIComponent(String(args.host_id));
    const params: Record<string, unknown> = {};
    for (const k of ["date_from", "date_to"]) if (args[k] !== undefined) params[k] = args[k];
    return text(await webmasterFetch("get", `/hosts/${h}/indexing/history/`, { params }));
  },
  async yd_webmaster_indexing_samples(args) {
    const h = encodeURIComponent(String(args.host_id));
    const params: Record<string, unknown> = {};
    for (const k of ["offset", "limit"]) if (args[k] !== undefined) params[k] = args[k];
    return text(await webmasterFetch("get", `/hosts/${h}/indexing/samples/`, { params }));
  },
  async yd_webmaster_insearch_history(args) {
    const h = encodeURIComponent(String(args.host_id));
    const params: Record<string, unknown> = {};
    for (const k of ["date_from", "date_to"]) if (args[k] !== undefined) params[k] = args[k];
    return text(await webmasterFetch("get", `/hosts/${h}/search-urls/in-search/history/`, { params }));
  },
  async yd_webmaster_insearch_samples(args) {
    const h = encodeURIComponent(String(args.host_id));
    const params: Record<string, unknown> = {};
    for (const k of ["offset", "limit"]) if (args[k] !== undefined) params[k] = args[k];
    return text(await webmasterFetch("get", `/hosts/${h}/search-urls/in-search/samples/`, { params }));
  },
  async yd_webmaster_search_events_samples(args) {
    const h = encodeURIComponent(String(args.host_id));
    const params: Record<string, unknown> = {};
    for (const k of ["offset", "limit"]) if (args[k] !== undefined) params[k] = args[k];
    return text(await webmasterFetch("get", `/hosts/${h}/search-urls/events/samples/`, { params }));
  },
  async yd_webmaster_search_queries_popular(args) {
    const h = encodeURIComponent(String(args.host_id));
    const params: Record<string, unknown> = {};
    for (const k of ["order_by", "query_indicator", "device_type_indicator", "date_from", "date_to", "offset", "limit"])
      if (args[k] !== undefined) params[k] = args[k];
    return text(await webmasterFetch("get", `/hosts/${h}/search-queries/popular/`, { params }));
  },
  async yd_webmaster_search_queries_history(args) {
    const h = encodeURIComponent(String(args.host_id));
    const params: Record<string, unknown> = {};
    for (const k of ["query_indicator", "date_from", "date_to", "device_type_indicator"])
      if (args[k] !== undefined) params[k] = args[k];
    return text(await webmasterFetch("get", `/hosts/${h}/search-queries/all/history/`, { params }));
  },
  async yd_webmaster_external_links_samples(args) {
    const h = encodeURIComponent(String(args.host_id));
    const params: Record<string, unknown> = {};
    for (const k of ["offset", "limit"]) if (args[k] !== undefined) params[k] = args[k];
    return text(await webmasterFetch("get", `/hosts/${h}/links/external/samples/`, { params }));
  },
  async yd_webmaster_external_links_history(args) {
    const h = encodeURIComponent(String(args.host_id));
    const params: Record<string, unknown> = {};
    for (const k of ["indicator", "date_from", "date_to"]) if (args[k] !== undefined) params[k] = args[k];
    return text(await webmasterFetch("get", `/hosts/${h}/links/external/history/`, { params }));
  },
  async yd_webmaster_broken_links_samples(args) {
    const h = encodeURIComponent(String(args.host_id));
    const params: Record<string, unknown> = {};
    for (const k of ["offset", "limit"]) if (args[k] !== undefined) params[k] = args[k];
    return text(await webmasterFetch("get", `/hosts/${h}/links/internal/broken/samples/`, { params }));
  },
  async yd_webmaster_recrawl_submit(args) {
    const h = encodeURIComponent(String(args.host_id));
    return text(await webmasterFetch("post", `/hosts/${h}/recrawl/queue/`, { body: { url: args.url } }));
  },
  async yd_webmaster_recrawl_list(args) {
    const h = encodeURIComponent(String(args.host_id));
    const params: Record<string, unknown> = {};
    for (const k of ["offset", "limit", "date_from", "date_to"]) if (args[k] !== undefined) params[k] = args[k];
    return text(await webmasterFetch("get", `/hosts/${h}/recrawl/queue/`, { params }));
  },
  async yd_webmaster_recrawl_task(args) {
    const h = encodeURIComponent(String(args.host_id));
    const t = encodeURIComponent(String(args.task_id));
    return text(await webmasterFetch("get", `/hosts/${h}/recrawl/queue/${t}/`));
  },
  async yd_webmaster_recrawl_quota(args) {
    const h = encodeURIComponent(String(args.host_id));
    return text(await webmasterFetch("get", `/hosts/${h}/recrawl/quota/`));
  },
  async yd_webmaster_important_urls(args) {
    const h = encodeURIComponent(String(args.host_id));
    return text(await webmasterFetch("get", `/hosts/${h}/important-urls/`));
  },
};
