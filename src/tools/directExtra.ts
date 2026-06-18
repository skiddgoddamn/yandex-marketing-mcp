import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { callApi, callApi501, rublesToMicros } from "../yandexApi.js";
import { text } from "../types.js";
import type { ToolDef, Handler } from "../types.js";

export const directExtraTools: ToolDef[] = [
  // --- VCards ---
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
        street: { type: "string" },
        house: { type: "string" },
        work_time: { type: "string", description: "Working hours, e.g. '0;6;10;00;18;00'" },
        extra_message: { type: "string", description: "Additional message" },
      },
      required: ["campaign_id", "company", "city_code", "phone_number", "city", "country"],
    },
  },
  {
    name: "yd_vcards_get",
    description: "Get VCards. Optionally filter by IDs.",
    inputSchema: {
      type: "object",
      properties: {
        vcard_ids: { type: "array", items: { type: "integer" }, description: "VCard IDs to get" },
      },
    },
  },
  {
    name: "yd_vcards_delete",
    description: "Delete VCards by IDs.",
    inputSchema: {
      type: "object",
      properties: {
        vcard_ids: { type: "array", items: { type: "integer" }, description: "VCard IDs to delete" },
      },
      required: ["vcard_ids"],
    },
  },
  // --- Feeds ---
  {
    name: "yd_feeds_add",
    description: "Add a feed for dynamic/smart/shopping ads.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Feed name" },
        business_type: { type: "string", enum: ["RETAIL", "HOTELS", "REALTY", "AUTOMOBILES", "FLIGHTS", "OTHER"] },
        url: { type: "string", description: "Feed URL" },
        login: { type: "string", description: "HTTP auth login (optional)" },
        password: { type: "string", description: "HTTP auth password (optional)" },
        remove_utm_tags: { type: "string", enum: ["YES", "NO"], description: "Remove UTM from URLs" },
      },
      required: ["name", "business_type", "url"],
    },
  },
  {
    name: "yd_feeds_get",
    description: "Get feeds. Optionally filter by IDs.",
    inputSchema: {
      type: "object",
      properties: {
        feed_ids: { type: "array", items: { type: "integer" } },
      },
    },
  },
  {
    name: "yd_feeds_update",
    description: "Update a feed (name, URL, auth).",
    inputSchema: {
      type: "object",
      properties: {
        feed_id: { type: "integer", description: "Feed ID" },
        name: { type: "string" },
        url: { type: "string" },
        login: { type: "string" },
        password: { type: "string" },
      },
      required: ["feed_id"],
    },
  },
  {
    name: "yd_feeds_delete",
    description: "Delete feeds by IDs.",
    inputSchema: {
      type: "object",
      properties: {
        feed_ids: { type: "array", items: { type: "integer" } },
      },
      required: ["feed_ids"],
    },
  },
  // --- Smart Ad Targets ---
  {
    name: "yd_smart_targets_add",
    description: "Add a smart ad target (filter) to an ad group.",
    inputSchema: {
      type: "object",
      properties: {
        adgroup_id: { type: "integer", description: "Ad group ID" },
        name: { type: "string", description: "Target name" },
        available_items_only: { type: "string", enum: ["YES", "NO"], description: "Show only available items" },
        conditions: { type: "array", items: { type: "object" }, description: "Filter conditions array" },
      },
      required: ["adgroup_id", "name"],
    },
  },
  {
    name: "yd_smart_targets_get",
    description: "Get smart ad targets by campaign, ad group, or target IDs.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_ids: { type: "array", items: { type: "integer" } },
        adgroup_ids: { type: "array", items: { type: "integer" } },
        target_ids: { type: "array", items: { type: "integer" } },
      },
    },
  },
  {
    name: "yd_smart_targets_action",
    description: "Suspend, resume, or delete smart ad targets.",
    inputSchema: {
      type: "object",
      properties: {
        target_ids: { type: "array", items: { type: "integer" } },
        action: { type: "string", enum: ["suspend", "resume", "delete"] },
      },
      required: ["target_ids", "action"],
    },
  },
  // --- Ad type tools ---
  {
    name: "yd_ads_add_dynamic",
    description: "Create a dynamic text ad.",
    inputSchema: {
      type: "object",
      properties: {
        adgroup_id: { type: "integer", description: "Ad group ID" },
        text: { type: "string", description: "Ad text (max 81 chars)" },
        ad_image_hash: { type: "string" },
        sitelink_set_id: { type: "integer" },
      },
      required: ["adgroup_id", "text"],
    },
  },
  {
    name: "yd_ads_add_image",
    description: "Create an image ad (TextImageAd).",
    inputSchema: {
      type: "object",
      properties: {
        adgroup_id: { type: "integer", description: "Ad group ID" },
        ad_image_hash: { type: "string", description: "Image hash" },
        href: { type: "string", description: "Landing page URL" },
      },
      required: ["adgroup_id", "ad_image_hash", "href"],
    },
  },
  {
    name: "yd_ads_add_shopping",
    description: "Create a shopping ad (uses v501 API).",
    inputSchema: {
      type: "object",
      properties: {
        adgroup_id: { type: "integer", description: "Ad group ID" },
        feed_id: { type: "integer", description: "Feed ID" },
        conditions: { type: "array", items: { type: "object" }, description: "Feed filter conditions" },
        default_texts: { type: "object", description: "Default texts for the ad" },
        sitelink_set_id: { type: "integer" },
      },
      required: ["adgroup_id", "feed_id"],
    },
  },
  // --- Video / Creative tools ---
  {
    name: "yd_videos_upload",
    description: "Upload a video from a local file (base64-encoded).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Path to video file on server" },
        name: { type: "string", description: "Video name (optional)" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "yd_videos_get",
    description: "Get ad videos. Optionally filter by IDs.",
    inputSchema: {
      type: "object",
      properties: {
        video_ids: { type: "array", items: { type: "integer" } },
      },
    },
  },
  {
    name: "yd_creatives_add",
    description: "Create a video extension creative.",
    inputSchema: {
      type: "object",
      properties: {
        video_id: { type: "string", description: "Video ID" },
      },
      required: ["video_id"],
    },
  },
  {
    name: "yd_creatives_get",
    description: "Get creatives. Optionally filter by IDs or types.",
    inputSchema: {
      type: "object",
      properties: {
        creative_ids: { type: "array", items: { type: "integer" } },
        types: { type: "array", items: { type: "string" }, description: "Creative types filter" },
      },
    },
  },
  // --- Misc tools ---
  {
    name: "yd_callouts_link",
    description: "Link callout extensions to an ad (uses v501 API).",
    inputSchema: {
      type: "object",
      properties: {
        ad_id: { type: "integer", description: "Ad ID" },
        callout_ids: { type: "array", items: { type: "integer" }, description: "Callout extension IDs" },
      },
      required: ["ad_id", "callout_ids"],
    },
  },
  {
    name: "yd_bid_modifiers_toggle",
    description: "Enable or disable bid modifiers.",
    inputSchema: {
      type: "object",
      properties: {
        bid_modifier_ids: { type: "array", items: { type: "integer" } },
        enabled: { type: "boolean", description: "true = enable, false = disable" },
      },
      required: ["bid_modifier_ids", "enabled"],
    },
  },
  {
    name: "yd_adgroups_update",
    description: "Update an ad group (name, regions, negatives, tracking).",
    inputSchema: {
      type: "object",
      properties: {
        adgroup_id: { type: "integer", description: "Ad group ID" },
        name: { type: "string" },
        region_ids: { type: "array", items: { type: "integer" } },
        negative_keywords: { type: "array", items: { type: "string" } },
        tracking_params: { type: "string", description: "UTM tracking params" },
      },
      required: ["adgroup_id"],
    },
  },
  {
    name: "yd_regions_get",
    description: "Get regions dictionary (convenience wrapper).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "yd_interests_get",
    description: "Get interests dictionary (convenience wrapper).",
    inputSchema: { type: "object", properties: {} },
  },
  // --- New tools (_NEW_TOOLS) ---
  {
    name: "yd_excluded_sites_get",
    description: "Get list of excluded sites (blocked placements) for a campaign.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "integer", description: "Campaign ID" },
      },
      required: ["campaign_id"],
    },
  },
  {
    name: "yd_excluded_sites_update",
    description: "Set excluded sites (blocked placements) for a campaign. Replaces entire list.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "integer", description: "Campaign ID" },
        sites: { type: "array", items: { type: "string" }, description: "List of sites to exclude (e.g. ['games.yandex.ru', 'AdsNative', 'example.com'])" },
      },
      required: ["campaign_id", "sites"],
    },
  },
  {
    name: "yd_blocked_ips_update",
    description: "Set blocked IPs for a campaign (max 25). Only exact IPs, no subnets.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "integer", description: "Campaign ID" },
        ips: { type: "array", items: { type: "string" }, description: "List of IPs to block (e.g. ['1.2.3.4', '5.6.7.8'])" },
      },
      required: ["campaign_id", "ips"],
    },
  },
  {
    name: "yd_campaign_strategy_update",
    description: "Update campaign bidding strategy. Change CPA, weekly limit, goal, or strategy type.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "integer", description: "Campaign ID" },
        strategy_search: { type: "string", enum: ["PAY_FOR_CONVERSION", "WB_MAXIMUM_CLICKS", "WB_MAXIMUM_CONVERSION_RATE", "SERVING_OFF"], description: "Search strategy type" },
        strategy_network: { type: "string", enum: ["SERVING_OFF", "NETWORK_DEFAULT", "WB_MAXIMUM_CLICKS", "WB_MAXIMUM_CONVERSION_RATE"], description: "Network strategy type" },
        cpa: { type: "number", description: "Target CPA in rubles (for PAY_FOR_CONVERSION)" },
        goal_id: { type: "integer", description: "Metrika goal ID" },
        weekly_spend_limit: { type: "number", description: "Weekly spend limit in rubles" },
      },
      required: ["campaign_id"],
    },
  },
];

export const directExtraHandlers: Record<string, Handler> = {
  async yd_vcards_add(args, ctx) {
    const vcard: Record<string, unknown> = {
      CampaignId: args.campaign_id,
      CompanyName: args.company,
      Phone: { CountryCode: "+7", CityCode: args.city_code, PhoneNumber: args.phone_number },
      Country: args.country,
      City: args.city,
    };
    for (const [src, dst] of [["street", "Street"], ["house", "House"], ["work_time", "WorkTime"], ["extra_message", "ExtraMessage"]] as const)
      if (args[src]) vcard[dst] = args[src];
    const data = await callApi("vcards", "add", { VCards: [vcard] }, ctx);
    return text(data.result ?? data);
  },

  async yd_vcards_get(args, ctx) {
    const criteria: Record<string, unknown> = {};
    if (args.vcard_ids) criteria.Ids = args.vcard_ids;
    const fields = ["Id", "CampaignId", "Country", "City", "Street", "House", "CompanyName", "Phone", "WorkTime", "ExtraMessage"];
    const data = await callApi("vcards", "get", { SelectionCriteria: criteria, FieldNames: fields }, ctx);
    return text(data.result ?? data);
  },

  async yd_vcards_delete(args, ctx) {
    const data = await callApi("vcards", "delete", { SelectionCriteria: { Ids: args.vcard_ids } }, ctx);
    return text(data.result ?? data);
  },

  async yd_feeds_add(args, ctx) {
    const urlFeed: Record<string, unknown> = { Url: args.url };
    if (args.login) urlFeed.Login = args.login;
    if (args.password) urlFeed.Password = args.password;
    if (args.remove_utm_tags) urlFeed.RemoveUtmTags = args.remove_utm_tags;
    const feed = { Name: args.name, BusinessType: args.business_type, SourceType: "URL", UrlFeed: urlFeed };
    const data = await callApi("feeds", "add", { Feeds: [feed] }, ctx);
    return text(data.result ?? data);
  },

  async yd_feeds_get(args, ctx) {
    const criteria: Record<string, unknown> = {};
    if (args.feed_ids) criteria.Ids = args.feed_ids;
    const fields = ["Id", "Name", "BusinessType", "SourceType", "UrlFeed", "Status", "NumberOfItems"];
    const data = await callApi("feeds", "get", { SelectionCriteria: criteria, FieldNames: fields }, ctx);
    return text(data.result ?? data);
  },

  async yd_feeds_update(args, ctx) {
    const feed: Record<string, unknown> = { Id: args.feed_id };
    if (args.name) feed.Name = args.name;
    const urlFeed: Record<string, unknown> = {};
    if (args.url) urlFeed.Url = args.url;
    if (args.login) urlFeed.Login = args.login;
    if (args.password) urlFeed.Password = args.password;
    if (Object.keys(urlFeed).length) feed.UrlFeed = urlFeed;
    const data = await callApi("feeds", "update", { Feeds: [feed] }, ctx);
    return text(data.result ?? data);
  },

  async yd_feeds_delete(args, ctx) {
    const data = await callApi("feeds", "delete", { SelectionCriteria: { Ids: args.feed_ids } }, ctx);
    return text(data.result ?? data);
  },

  async yd_smart_targets_add(args, ctx) {
    const target: Record<string, unknown> = { AdGroupId: args.adgroup_id, Name: args.name };
    if (args.available_items_only) target.AvailableItemsOnly = args.available_items_only;
    if (args.conditions) target.Conditions = args.conditions;
    const data = await callApi("smartadtargets", "add", { SmartAdTargets: [target] }, ctx);
    return text(data.result ?? data);
  },

  async yd_smart_targets_get(args, ctx) {
    const criteria: Record<string, unknown> = {};
    if (args.campaign_ids) criteria.CampaignIds = args.campaign_ids;
    if (args.adgroup_ids) criteria.AdGroupIds = args.adgroup_ids;
    if (args.target_ids) criteria.Ids = args.target_ids;
    const fields = ["Id", "AdGroupId", "CampaignId", "Name", "AvailableItemsOnly", "Conditions", "State", "StatusClarification"];
    const data = await callApi("smartadtargets", "get", { SelectionCriteria: criteria, FieldNames: fields }, ctx);
    return text(data.result ?? data);
  },

  async yd_smart_targets_action(args, ctx) {
    const action = args.action as string;
    const data = await callApi("smartadtargets", action, { SelectionCriteria: { Ids: args.target_ids } }, ctx);
    return text(data.result ?? data);
  },

  async yd_ads_add_dynamic(args, ctx) {
    const dyn: Record<string, unknown> = { Text: args.text };
    if (args.ad_image_hash) dyn.AdImageHash = args.ad_image_hash;
    if (args.sitelink_set_id) dyn.SitelinkSetId = args.sitelink_set_id;
    const ad = { AdGroupId: args.adgroup_id, DynamicTextAd: dyn };
    const data = await callApi("ads", "add", { Ads: [ad] }, ctx);
    return text(data.result ?? data);
  },

  async yd_ads_add_image(args, ctx) {
    const ad = {
      AdGroupId: args.adgroup_id,
      TextImageAd: { AdImageHash: args.ad_image_hash, Href: args.href },
    };
    const data = await callApi("ads", "add", { Ads: [ad] }, ctx);
    return text(data.result ?? data);
  },

  async yd_ads_add_shopping(args, ctx) {
    const shopping: Record<string, unknown> = { FeedId: args.feed_id };
    if (args.conditions) shopping.Conditions = args.conditions;
    if (args.default_texts) shopping.DefaultTexts = args.default_texts;
    if (args.sitelink_set_id) shopping.SitelinkSetId = args.sitelink_set_id;
    const ad = { AdGroupId: args.adgroup_id, ShoppingAd: shopping };
    const data = await callApi501("ads", "add", { Ads: [ad] }, ctx);
    return text(data.result ?? data);
  },

  async yd_videos_upload(args, ctx) {
    const filePath = args.file_path as string;
    const videoData = readFileSync(filePath).toString("base64");
    const name = (args.name as string | undefined) || basename(filePath);
    const video = { VideoData: videoData, Name: name };
    const data = await callApi("advideos", "add", { AdVideos: [video] }, ctx, { timeoutMs: 300000 });
    return text(data.result ?? data);
  },

  async yd_videos_get(args, ctx) {
    const criteria: Record<string, unknown> = {};
    if (args.video_ids) criteria.Ids = args.video_ids;
    const fields = ["Id", "Name", "Status", "Duration", "PreviewUrl"];
    const data = await callApi("advideos", "get", { SelectionCriteria: criteria, FieldNames: fields }, ctx);
    return text(data.result ?? data);
  },

  async yd_creatives_add(args, ctx) {
    const creative = { VideoExtensionCreative: { VideoId: args.video_id } };
    const data = await callApi("creatives", "add", { Creatives: [creative] }, ctx);
    return text(data.result ?? data);
  },

  async yd_creatives_get(args, ctx) {
    const criteria: Record<string, unknown> = {};
    if (args.creative_ids) criteria.Ids = args.creative_ids;
    if (args.types) criteria.Types = args.types;
    const fields = ["Id", "Type", "Name", "PreviewUrl", "VideoExtensionCreative"];
    const data = await callApi("creatives", "get", { SelectionCriteria: criteria, FieldNames: fields }, ctx);
    return text(data.result ?? data);
  },

  async yd_callouts_link(args, ctx) {
    const extensions = (args.callout_ids as number[]).map((cid) => ({ AdExtensionId: cid, Operation: "SET" }));
    const ad = { Id: args.ad_id, TextAd: { CalloutSetting: { AdExtensions: extensions } } };
    const data = await callApi501("ads", "update", { Ads: [ad] }, ctx);
    return text(data.result ?? data);
  },

  async yd_bid_modifiers_toggle(args, ctx) {
    const enabled = args.enabled ? "YES" : "NO";
    const items = (args.bid_modifier_ids as number[]).map((mid) => ({ BidModifierId: mid, Enabled: enabled }));
    const data = await callApi("bidmodifiers", "toggle", { BidModifierToggleItems: items }, ctx);
    return text(data.result ?? data);
  },

  async yd_adgroups_update(args, ctx) {
    const group: Record<string, unknown> = { Id: args.adgroup_id };
    if (args.name) group.Name = args.name;
    if (args.region_ids) group.RegionIds = args.region_ids;
    if (args.negative_keywords) group.NegativeKeywords = { Items: args.negative_keywords };
    if (args.tracking_params) group.TrackingParams = args.tracking_params;
    const data = await callApi("adgroups", "update", { AdGroups: [group] }, ctx);
    return text(data.result ?? data);
  },

  async yd_regions_get(args, ctx) {
    const data = await callApi("dictionaries", "get", { DictionaryNames: ["GeoRegions"] }, ctx);
    return text(data.result ?? data);
  },

  async yd_interests_get(args, ctx) {
    const data = await callApi("dictionaries", "get", { DictionaryNames: ["Interests"] }, ctx);
    return text(data.result ?? data);
  },

  async yd_excluded_sites_get(args, ctx) {
    const data = await callApi("campaigns", "get", {
      SelectionCriteria: { Ids: [args.campaign_id] },
      FieldNames: ["Id", "Name", "ExcludedSites"],
    }, ctx);
    const camps: any[] = data?.result?.Campaigns ?? [];
    if (camps.length) {
      const sites: string[] = camps[0]?.ExcludedSites?.Items ?? [];
      return text({ campaign_id: args.campaign_id, excluded_sites: sites, count: sites.length });
    }
    return text({ error: "Campaign not found" });
  },

  async yd_excluded_sites_update(args, ctx) {
    const data = await callApi("campaigns", "update", {
      Campaigns: [{
        Id: args.campaign_id,
        ExcludedSites: { Items: args.sites },
      }],
    }, ctx);
    return text(data.result ?? data);
  },

  async yd_blocked_ips_update(args, ctx) {
    const data = await callApi("campaigns", "update", {
      Campaigns: [{
        Id: args.campaign_id,
        BlockedIps: { Items: args.ips },
      }],
    }, ctx);
    return text(data.result ?? data);
  },

  async yd_campaign_strategy_update(args, ctx) {
    const campaign: Record<string, unknown> = { Id: args.campaign_id, TextCampaign: { BiddingStrategy: {} } };
    const strategy = (campaign.TextCampaign as Record<string, unknown>).BiddingStrategy as Record<string, unknown>;

    const searchType = args.strategy_search as string | undefined;
    const networkType = args.strategy_network as string | undefined;

    if (searchType) {
      const searchObj: Record<string, unknown> = { BiddingStrategyType: searchType };
      if (searchType === "PAY_FOR_CONVERSION") {
        const params: Record<string, unknown> = {};
        if (args.goal_id) params.GoalId = args.goal_id;
        if (args.cpa) params.Cpa = rublesToMicros(args.cpa as number);
        if (args.weekly_spend_limit) params.WeeklySpendLimit = rublesToMicros(args.weekly_spend_limit as number);
        searchObj.PayForConversion = params;
      } else if (searchType === "WB_MAXIMUM_CLICKS") {
        const params: Record<string, unknown> = {};
        if (args.weekly_spend_limit) params.WeeklySpendLimit = rublesToMicros(args.weekly_spend_limit as number);
        searchObj.WbMaximumClicks = params;
      } else if (searchType === "WB_MAXIMUM_CONVERSION_RATE") {
        const params: Record<string, unknown> = {};
        if (args.goal_id) params.GoalId = args.goal_id;
        if (args.weekly_spend_limit) params.WeeklySpendLimit = rublesToMicros(args.weekly_spend_limit as number);
        searchObj.WbMaximumConversionRate = params;
      }
      // SERVING_OFF: no sub-object needed
      strategy.Search = searchObj;
    }

    if (networkType) {
      const networkObj: Record<string, unknown> = { BiddingStrategyType: networkType };
      if (networkType === "WB_MAXIMUM_CONVERSION_RATE") {
        const params: Record<string, unknown> = {};
        if (args.goal_id) params.GoalId = args.goal_id;
        if (args.weekly_spend_limit) params.WeeklySpendLimit = rublesToMicros(args.weekly_spend_limit as number);
        networkObj.WbMaximumConversionRate = params;
      } else if (networkType === "WB_MAXIMUM_CLICKS") {
        const params: Record<string, unknown> = {};
        if (args.weekly_spend_limit) params.WeeklySpendLimit = rublesToMicros(args.weekly_spend_limit as number);
        networkObj.WbMaximumClicks = params;
      } else if (networkType === "NETWORK_DEFAULT") {
        networkObj.NetworkDefault = { LimitPercent: 100 };
      }
      // SERVING_OFF: no sub-object needed
      strategy.Network = networkObj;
    }

    const data = await callApi("campaigns", "update", { Campaigns: [campaign] }, ctx);
    return text(data.result ?? data);
  },
};
