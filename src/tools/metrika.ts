import { metrikaFetch } from "../yandexApi.js";
import { text } from "../types.js";
import type { ToolDef, Handler } from "../types.js";

export const metrikaTools: ToolDef[] = [
  // ── COUNTERS (5) ────────────────────────────────────────────────────
  {
    name: "yd_metrika_counters_get",
    description: "List all Metrika counters. Optional search and favorite filter.",
    inputSchema: {
      type: "object",
      properties: {
        search_string: { type: "string", description: "Search by name or URL" },
        favorite: { type: "boolean", description: "Only favorite counters" },
      },
    },
  },
  {
    name: "yd_metrika_counter_get",
    description: "Get counter details by ID.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
      },
      required: ["counter_id"],
    },
  },
  {
    name: "yd_metrika_counter_create",
    description: "Create a new Metrika counter.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Counter name" },
        site: { type: "string", description: "Site domain (e.g. example.com)" },
      },
      required: ["name", "site"],
    },
  },
  {
    name: "yd_metrika_counter_update",
    description: "Update a Metrika counter.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        name: { type: "string", description: "New name" },
        site: { type: "string", description: "New site domain" },
        favorite: { type: "boolean", description: "Mark as favorite" },
      },
      required: ["counter_id"],
    },
  },
  {
    name: "yd_metrika_counter_delete",
    description: "Delete a Metrika counter.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
      },
      required: ["counter_id"],
    },
  },

  // ── GOALS (4) ───────────────────────────────────────────────────────
  {
    name: "yd_metrika_goals_get",
    description: "List goals for a counter.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
      },
      required: ["counter_id"],
    },
  },
  {
    name: "yd_metrika_goal_create",
    description: "Create a goal for a counter.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        name: { type: "string", description: "Goal name" },
        goal_type: { type: "string", description: "Goal type: url, number, step, action, phone, email, etc." },
        conditions: { type: "array", items: { type: "object" }, description: "Conditions array, e.g. [{\"type\": \"contain\", \"url\": \"/thank-you\"}]" },
      },
      required: ["counter_id", "name", "goal_type", "conditions"],
    },
  },
  {
    name: "yd_metrika_goal_update",
    description: "Update a goal.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        goal_id: { type: "integer", description: "Goal ID" },
        name: { type: "string", description: "New goal name" },
        goal_type: { type: "string", description: "New goal type" },
        conditions: { type: "array", items: { type: "object" }, description: "New conditions" },
      },
      required: ["counter_id", "goal_id"],
    },
  },
  {
    name: "yd_metrika_goal_delete",
    description: "Delete a goal.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        goal_id: { type: "integer", description: "Goal ID" },
      },
      required: ["counter_id", "goal_id"],
    },
  },

  // ── SEGMENTS (4) ────────────────────────────────────────────────────
  {
    name: "yd_metrika_segments_get",
    description: "List segments for a counter.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
      },
      required: ["counter_id"],
    },
  },
  {
    name: "yd_metrika_segment_create",
    description: "Create a segment.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        name: { type: "string", description: "Segment name" },
        expression: { type: "string", description: "Segment expression" },
      },
      required: ["counter_id", "name", "expression"],
    },
  },
  {
    name: "yd_metrika_segment_update",
    description: "Update a segment.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        segment_id: { type: "integer", description: "Segment ID" },
        name: { type: "string", description: "New name" },
        expression: { type: "string", description: "New expression" },
      },
      required: ["counter_id", "segment_id"],
    },
  },
  {
    name: "yd_metrika_segment_delete",
    description: "Delete a segment.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        segment_id: { type: "integer", description: "Segment ID" },
      },
      required: ["counter_id", "segment_id"],
    },
  },

  // ── FILTERS (4) ─────────────────────────────────────────────────────
  {
    name: "yd_metrika_filters_get",
    description: "List filters for a counter.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
      },
      required: ["counter_id"],
    },
  },
  {
    name: "yd_metrika_filter_create",
    description: "Create a filter for a counter.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        attr: { type: "string", description: "Filter attribute (e.g. ip, title, url, referer)" },
        type: { type: "string", description: "Match type (equal, contain, start, etc.)" },
        value: { type: "string", description: "Filter value" },
        action: { type: "string", description: "Action: include or exclude" },
        status: { type: "string", description: "Status: active or disabled" },
      },
      required: ["counter_id", "attr", "type", "value"],
    },
  },
  {
    name: "yd_metrika_filter_update",
    description: "Update a filter.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        filter_id: { type: "integer", description: "Filter ID" },
        attr: { type: "string", description: "Filter attribute" },
        type: { type: "string", description: "Match type" },
        value: { type: "string", description: "Filter value" },
        action: { type: "string", description: "Action" },
        status: { type: "string", description: "Status" },
      },
      required: ["counter_id", "filter_id"],
    },
  },
  {
    name: "yd_metrika_filter_delete",
    description: "Delete a filter.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        filter_id: { type: "integer", description: "Filter ID" },
      },
      required: ["counter_id", "filter_id"],
    },
  },

  // ── GRANTS (4) ──────────────────────────────────────────────────────
  {
    name: "yd_metrika_grants_get",
    description: "List access grants for a counter.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
      },
      required: ["counter_id"],
    },
  },
  {
    name: "yd_metrika_grant_add",
    description: "Add access grant to a counter.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        user_login: { type: "string", description: "Yandex login of user" },
        permission: { type: "string", description: "Permission: view or edit" },
        comment: { type: "string", description: "Optional comment" },
      },
      required: ["counter_id", "user_login"],
    },
  },
  {
    name: "yd_metrika_grant_update",
    description: "Update access grant.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        user_login: { type: "string", description: "Yandex login of user" },
        permission: { type: "string", description: "New permission: view or edit" },
      },
      required: ["counter_id", "user_login", "permission"],
    },
  },
  {
    name: "yd_metrika_grant_delete",
    description: "Delete access grant.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        user_login: { type: "string", description: "Yandex login of user" },
      },
      required: ["counter_id", "user_login"],
    },
  },

  // ── REPORTS (4) ─────────────────────────────────────────────────────
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
  {
    name: "yd_metrika_report_by_time",
    description: "Get a Metrika report grouped by time.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        metrics: { type: "array", items: { type: "string" }, description: "Metrics" },
        group: { type: "string", description: "Grouping: day, week, month" },
        dimensions: { type: "array", items: { type: "string" }, description: "Dimensions" },
        date1: { type: "string", description: "Start date YYYY-MM-DD" },
        date2: { type: "string", description: "End date YYYY-MM-DD" },
      },
      required: ["counter_id", "metrics", "group"],
    },
  },
  {
    name: "yd_metrika_report_comparison",
    description: "Get a Metrika comparison report (A vs B periods).",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        metrics: { type: "array", items: { type: "string" }, description: "Metrics" },
        date1_a: { type: "string", description: "Period A start" },
        date2_a: { type: "string", description: "Period A end" },
        date1_b: { type: "string", description: "Period B start" },
        date2_b: { type: "string", description: "Period B end" },
        dimensions: { type: "array", items: { type: "string" }, description: "Dimensions" },
      },
      required: ["counter_id", "metrics", "date1_a", "date2_a", "date1_b", "date2_b"],
    },
  },
  {
    name: "yd_metrika_report_drilldown",
    description: "Get a Metrika drilldown report.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        metrics: { type: "array", items: { type: "string" }, description: "Metrics" },
        dimensions: { type: "array", items: { type: "string" }, description: "Dimensions" },
        date1: { type: "string", description: "Start date YYYY-MM-DD" },
        date2: { type: "string", description: "End date YYYY-MM-DD" },
        parent_id: { type: "string", description: "Parent row ID for drilldown" },
      },
      required: ["counter_id", "metrics", "dimensions"],
    },
  },

  // ── OFFLINE DATA (5) ────────────────────────────────────────────────
  {
    name: "yd_metrika_upload_conversions",
    description: "Upload offline conversions.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        conversions: { type: "array", items: { type: "object" }, description: "Array of conversions: [{DateTime, Target, ClientId?, Price?}]" },
        client_id_type: { type: "string", description: "CLIENT_ID or USER_ID (default CLIENT_ID)" },
      },
      required: ["counter_id", "conversions"],
    },
  },
  {
    name: "yd_metrika_conversions_status",
    description: "Get offline conversions upload status.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
      },
      required: ["counter_id"],
    },
  },
  {
    name: "yd_metrika_upload_calls",
    description: "Upload offline calls.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        calls: { type: "array", items: { type: "object" }, description: "Array of call data" },
        client_id_type: { type: "string", description: "CLIENT_ID or USER_ID (default CLIENT_ID)" },
      },
      required: ["counter_id", "calls"],
    },
  },
  {
    name: "yd_metrika_upload_expenses",
    description: "Upload advertising expenses.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        expenses: { type: "array", items: { type: "object" }, description: "Array of expense data" },
      },
      required: ["counter_id", "expenses"],
    },
  },
  {
    name: "yd_metrika_upload_user_params",
    description: "Upload user parameters.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        users: { type: "array", items: { type: "object" }, description: "Array of user data" },
        client_id_type: { type: "string", description: "CLIENT_ID or USER_ID (default CLIENT_ID)" },
      },
      required: ["counter_id", "users"],
    },
  },

  // ── LABELS (4) ──────────────────────────────────────────────────────
  {
    name: "yd_metrika_labels_get",
    description: "List all labels.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "yd_metrika_label_create",
    description: "Create a label.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Label name" },
      },
      required: ["name"],
    },
  },
  {
    name: "yd_metrika_label_update",
    description: "Update a label.",
    inputSchema: {
      type: "object",
      properties: {
        label_id: { type: "integer", description: "Label ID" },
        name: { type: "string", description: "New label name" },
      },
      required: ["label_id", "name"],
    },
  },
  {
    name: "yd_metrika_label_delete",
    description: "Delete a label.",
    inputSchema: {
      type: "object",
      properties: {
        label_id: { type: "integer", description: "Label ID" },
      },
      required: ["label_id"],
    },
  },

  // ── LABEL-COUNTER LINKS (2) ──────────────────────────────────────────
  {
    name: "yd_metrika_label_link",
    description: "Link a counter to a label.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        label_id: { type: "integer", description: "Label ID" },
      },
      required: ["counter_id", "label_id"],
    },
  },
  {
    name: "yd_metrika_label_unlink",
    description: "Unlink a counter from a label.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        label_id: { type: "integer", description: "Label ID" },
      },
      required: ["counter_id", "label_id"],
    },
  },

  // ── ANNOTATIONS (4) ─────────────────────────────────────────────────
  {
    name: "yd_metrika_annotations_get",
    description: "List chart annotations for a counter.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
      },
      required: ["counter_id"],
    },
  },
  {
    name: "yd_metrika_annotation_create",
    description: "Create a chart annotation.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        date: { type: "string", description: "Date YYYY-MM-DD" },
        title: { type: "string", description: "Annotation title" },
        message: { type: "string", description: "Optional message" },
      },
      required: ["counter_id", "date", "title"],
    },
  },
  {
    name: "yd_metrika_annotation_update",
    description: "Update a chart annotation.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        annotation_id: { type: "integer", description: "Annotation ID" },
        date: { type: "string", description: "New date" },
        title: { type: "string", description: "New title" },
        message: { type: "string", description: "New message" },
      },
      required: ["counter_id", "annotation_id"],
    },
  },
  {
    name: "yd_metrika_annotation_delete",
    description: "Delete a chart annotation.",
    inputSchema: {
      type: "object",
      properties: {
        counter_id: { type: "integer", description: "Counter ID" },
        annotation_id: { type: "integer", description: "Annotation ID" },
      },
      required: ["counter_id", "annotation_id"],
    },
  },

  // ── DELEGATES (3) ───────────────────────────────────────────────────
  {
    name: "yd_metrika_delegates_get",
    description: "List all delegates.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "yd_metrika_delegate_add",
    description: "Add a delegate.",
    inputSchema: {
      type: "object",
      properties: {
        user_login: { type: "string", description: "Yandex login" },
        comment: { type: "string", description: "Optional comment" },
      },
      required: ["user_login"],
    },
  },
  {
    name: "yd_metrika_delegate_delete",
    description: "Delete a delegate.",
    inputSchema: {
      type: "object",
      properties: {
        user_login: { type: "string", description: "Yandex login" },
      },
      required: ["user_login"],
    },
  },
];

export const metrikaHandlers: Record<string, Handler> = {
  // ── COUNTERS ────────────────────────────────────────────────────────

  async yd_metrika_counters_get(args) {
    const params: Record<string, unknown> = {};
    if (args.search_string) params.search_string = args.search_string;
    if (args.favorite != null) params.favorite = args.favorite ? "1" : "0";
    return text(await metrikaFetch("get", "/management/v1/counters", Object.keys(params).length ? { params } : {}));
  },

  async yd_metrika_counter_get(args) {
    return text(await metrikaFetch("get", `/management/v1/counter/${Number(args.counter_id)}`));
  },

  async yd_metrika_counter_create(args) {
    const body = { counter: { name: String(args.name), site2: { site: String(args.site) } } };
    return text(await metrikaFetch("post", "/management/v1/counters", { body }));
  },

  async yd_metrika_counter_update(args) {
    const cid = Number(args.counter_id);
    const counter: Record<string, unknown> = {};
    for (const k of ["name", "site", "favorite"] as const) {
      if (args[k] != null) counter[k] = args[k];
    }
    return text(await metrikaFetch("put", `/management/v1/counter/${cid}`, { body: { counter } }));
  },

  async yd_metrika_counter_delete(args) {
    return text(await metrikaFetch("delete", `/management/v1/counter/${Number(args.counter_id)}`));
  },

  // ── GOALS ───────────────────────────────────────────────────────────

  async yd_metrika_goals_get(args) {
    return text(await metrikaFetch("get", `/management/v1/counter/${Number(args.counter_id)}/goals`));
  },

  async yd_metrika_goal_create(args) {
    const cid = Number(args.counter_id);
    const body = {
      goal: {
        name: args.name,
        type: args.goal_type,
        conditions: args.conditions,
      },
    };
    return text(await metrikaFetch("post", `/management/v1/counter/${cid}/goals`, { body }));
  },

  async yd_metrika_goal_update(args) {
    const cid = Number(args.counter_id);
    const gid = Number(args.goal_id);
    const goal: Record<string, unknown> = {};
    for (const k of ["name", "goal_type", "conditions"] as const) {
      if (args[k] != null) goal[k === "goal_type" ? "type" : k] = args[k];
    }
    return text(await metrikaFetch("put", `/management/v1/counter/${cid}/goal/${gid}`, { body: { goal } }));
  },

  async yd_metrika_goal_delete(args) {
    return text(await metrikaFetch("delete", `/management/v1/counter/${Number(args.counter_id)}/goal/${Number(args.goal_id)}`));
  },

  // ── SEGMENTS ────────────────────────────────────────────────────────

  async yd_metrika_segments_get(args) {
    return text(await metrikaFetch("get", `/management/v1/counter/${Number(args.counter_id)}/apisegment/segments`));
  },

  async yd_metrika_segment_create(args) {
    const cid = Number(args.counter_id);
    const body = { segment: { name: args.name, expression: args.expression } };
    return text(await metrikaFetch("post", `/management/v1/counter/${cid}/apisegment/segments`, { body }));
  },

  async yd_metrika_segment_update(args) {
    const cid = Number(args.counter_id);
    const sid = Number(args.segment_id);
    const seg: Record<string, unknown> = {};
    for (const k of ["name", "expression"] as const) {
      if (args[k] != null) seg[k] = args[k];
    }
    return text(await metrikaFetch("put", `/management/v1/counter/${cid}/apisegment/segment/${sid}`, { body: { segment: seg } }));
  },

  async yd_metrika_segment_delete(args) {
    return text(await metrikaFetch("delete", `/management/v1/counter/${Number(args.counter_id)}/apisegment/segment/${Number(args.segment_id)}`));
  },

  // ── FILTERS ─────────────────────────────────────────────────────────

  async yd_metrika_filters_get(args) {
    return text(await metrikaFetch("get", `/management/v1/counter/${Number(args.counter_id)}/filters`));
  },

  async yd_metrika_filter_create(args) {
    const cid = Number(args.counter_id);
    const filt: Record<string, unknown> = {
      attr: args.attr,
      type: args.type,
      value: args.value,
    };
    if (args.action) filt.action = args.action;
    if (args.status) filt.status = args.status;
    return text(await metrikaFetch("post", `/management/v1/counter/${cid}/filters`, { body: { filter: filt } }));
  },

  async yd_metrika_filter_update(args) {
    const cid = Number(args.counter_id);
    const fid = Number(args.filter_id);
    const filt: Record<string, unknown> = {};
    for (const k of ["attr", "type", "value", "action", "status"] as const) {
      if (args[k] != null) filt[k] = args[k];
    }
    return text(await metrikaFetch("put", `/management/v1/counter/${cid}/filter/${fid}`, { body: { filter: filt } }));
  },

  async yd_metrika_filter_delete(args) {
    return text(await metrikaFetch("delete", `/management/v1/counter/${Number(args.counter_id)}/filter/${Number(args.filter_id)}`));
  },

  // ── GRANTS ──────────────────────────────────────────────────────────

  async yd_metrika_grants_get(args) {
    return text(await metrikaFetch("get", `/management/v1/counter/${Number(args.counter_id)}/grants`));
  },

  async yd_metrika_grant_add(args) {
    const cid = Number(args.counter_id);
    const grant: Record<string, unknown> = {
      user_login: args.user_login,
      perm: args.permission ?? "view",
    };
    if (args.comment) grant.comment = args.comment;
    return text(await metrikaFetch("post", `/management/v1/counter/${cid}/grants`, { body: { grant } }));
  },

  async yd_metrika_grant_update(args) {
    const cid = Number(args.counter_id);
    const login = String(args.user_login);
    const body = { grant: { perm: args.permission } };
    return text(await metrikaFetch("put", `/management/v1/counter/${cid}/grant/${login}`, { body }));
  },

  async yd_metrika_grant_delete(args) {
    return text(await metrikaFetch("delete", `/management/v1/counter/${Number(args.counter_id)}/grant/${String(args.user_login)}`));
  },

  // ── REPORTS ─────────────────────────────────────────────────────────

  async yd_metrika_report(args) {
    const params: Record<string, unknown> = {
      id: Number(args.counter_id),
      metrics: (args.metrics as string[]).join(","),
    };
    if (args.dimensions) params.dimensions = (args.dimensions as string[]).join(",");
    for (const k of ["date1", "date2", "filters"] as const) if (args[k]) params[k] = args[k];
    if (args.sort) params.sort = (args.sort as string[]).join(",");
    if (args.limit) params.limit = args.limit;
    return text(await metrikaFetch("get", "/stat/v1/data", { params }));
  },

  async yd_metrika_report_by_time(args) {
    const params: Record<string, unknown> = {
      id: Number(args.counter_id),
      metrics: (args.metrics as string[]).join(","),
      group: args.group,
    };
    if (args.dimensions) params.dimensions = (args.dimensions as string[]).join(",");
    for (const k of ["date1", "date2"] as const) if (args[k]) params[k] = args[k];
    return text(await metrikaFetch("get", "/stat/v1/data/bytime", { params }));
  },

  async yd_metrika_report_comparison(args) {
    const params: Record<string, unknown> = {
      id: Number(args.counter_id),
      metrics: (args.metrics as string[]).join(","),
      date1_a: args.date1_a,
      date2_a: args.date2_a,
      date1_b: args.date1_b,
      date2_b: args.date2_b,
    };
    if (args.dimensions) params.dimensions = (args.dimensions as string[]).join(",");
    return text(await metrikaFetch("get", "/stat/v1/data/comparison", { params }));
  },

  async yd_metrika_report_drilldown(args) {
    const params: Record<string, unknown> = {
      id: Number(args.counter_id),
      metrics: (args.metrics as string[]).join(","),
      dimensions: (args.dimensions as string[]).join(","),
    };
    for (const k of ["date1", "date2", "parent_id"] as const) if (args[k]) params[k] = args[k];
    return text(await metrikaFetch("get", "/stat/v1/data/drilldown", { params }));
  },

  // ── OFFLINE DATA ────────────────────────────────────────────────────

  async yd_metrika_upload_conversions(args) {
    const cid = Number(args.counter_id);
    const ctype = (args.client_id_type as string | undefined) ?? "CLIENT_ID";
    const path = `/management/v1/counter/${cid}/offline_conversions/upload?client_id_type=${ctype}`;
    return text(await metrikaFetch("post", path, { body: { conversions: args.conversions } }));
  },

  async yd_metrika_conversions_status(args) {
    return text(await metrikaFetch("get", `/management/v1/counter/${Number(args.counter_id)}/offline_conversions/uploadings`));
  },

  async yd_metrika_upload_calls(args) {
    const cid = Number(args.counter_id);
    const ctype = (args.client_id_type as string | undefined) ?? "CLIENT_ID";
    const path = `/management/v1/counter/${cid}/offline_conversions/calls/upload?client_id_type=${ctype}`;
    return text(await metrikaFetch("post", path, { body: { calls: args.calls } }));
  },

  async yd_metrika_upload_expenses(args) {
    const cid = Number(args.counter_id);
    return text(await metrikaFetch("post", `/management/v1/counter/${cid}/expense/upload`, { body: { expenses: args.expenses } }));
  },

  async yd_metrika_upload_user_params(args) {
    const cid = Number(args.counter_id);
    const ctype = (args.client_id_type as string | undefined) ?? "CLIENT_ID";
    const path = `/management/v1/counter/${cid}/user_params/uploadings?client_id_type=${ctype}`;
    return text(await metrikaFetch("post", path, { body: { users: args.users } }));
  },

  // ── LABELS ──────────────────────────────────────────────────────────

  async yd_metrika_labels_get(_args) {
    return text(await metrikaFetch("get", "/management/v1/labels"));
  },

  async yd_metrika_label_create(args) {
    return text(await metrikaFetch("post", "/management/v1/labels", { body: { label: { name: args.name } } }));
  },

  async yd_metrika_label_update(args) {
    const lid = Number(args.label_id);
    return text(await metrikaFetch("put", `/management/v1/label/${lid}`, { body: { label: { name: args.name } } }));
  },

  async yd_metrika_label_delete(args) {
    return text(await metrikaFetch("delete", `/management/v1/label/${Number(args.label_id)}`));
  },

  // ── LABEL-COUNTER LINKS ─────────────────────────────────────────────

  async yd_metrika_label_link(args) {
    return text(await metrikaFetch("post", `/management/v1/counter/${Number(args.counter_id)}/label/${Number(args.label_id)}`, { body: {} }));
  },

  async yd_metrika_label_unlink(args) {
    return text(await metrikaFetch("delete", `/management/v1/counter/${Number(args.counter_id)}/label/${Number(args.label_id)}`));
  },

  // ── ANNOTATIONS ─────────────────────────────────────────────────────

  async yd_metrika_annotations_get(args) {
    return text(await metrikaFetch("get", `/management/v1/counter/${Number(args.counter_id)}/chart_annotations`));
  },

  async yd_metrika_annotation_create(args) {
    const cid = Number(args.counter_id);
    const ann: Record<string, unknown> = { date: args.date, title: args.title };
    if (args.message) ann.message = args.message;
    return text(await metrikaFetch("post", `/management/v1/counter/${cid}/chart_annotation`, { body: { annotation: ann } }));
  },

  async yd_metrika_annotation_update(args) {
    const cid = Number(args.counter_id);
    const aid = Number(args.annotation_id);
    const ann: Record<string, unknown> = {};
    for (const k of ["date", "title", "message"] as const) {
      if (args[k] != null) ann[k] = args[k];
    }
    return text(await metrikaFetch("put", `/management/v1/counter/${cid}/chart_annotation/${aid}`, { body: { annotation: ann } }));
  },

  async yd_metrika_annotation_delete(args) {
    return text(await metrikaFetch("delete", `/management/v1/counter/${Number(args.counter_id)}/chart_annotation/${Number(args.annotation_id)}`));
  },

  // ── DELEGATES ───────────────────────────────────────────────────────

  async yd_metrika_delegates_get(_args) {
    return text(await metrikaFetch("get", "/management/v1/delegates"));
  },

  async yd_metrika_delegate_add(args) {
    const d: Record<string, unknown> = { user_login: args.user_login };
    if (args.comment) d.comment = args.comment;
    return text(await metrikaFetch("post", "/management/v1/delegates", { body: { delegate: d } }));
  },

  async yd_metrika_delegate_delete(args) {
    return text(await metrikaFetch("delete", `/management/v1/delegate/${String(args.user_login)}`));
  },
};
