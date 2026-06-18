import { callApi, baseUrl, rublesToMicros } from "../yandexApi.js";
import { currentToken, AuthError } from "../auth.js";
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
  {
    name: "yd_campaigns_add",
    description: "Create a new text campaign. Supports all strategies: PAY_FOR_CONVERSION, WB_MAXIMUM_CLICKS, WB_MAXIMUM_CONVERSION_RATE, AVERAGE_CPA, SERVING_OFF, etc.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Campaign name (max 255 chars)" },
        start_date: { type: "string", description: "Start date YYYY-MM-DD" },
        end_date: { type: "string", description: "End date YYYY-MM-DD (optional)" },
        daily_budget_amount: { type: "number", description: "Daily budget in rubles (e.g. 500.00)" },
        daily_budget_mode: { type: "string", enum: ["STANDARD", "DISTRIBUTED"], description: "Budget spending mode" },
        strategy_search: { type: "string", enum: ["WB_MAXIMUM_CLICKS", "PAY_FOR_CONVERSION", "PAY_FOR_CONVERSION_MULTIPLE_GOALS", "WB_MAXIMUM_CONVERSION_RATE", "AVERAGE_CPA", "AVERAGE_CPC", "HIGHEST_POSITION", "SERVING_OFF"], description: "Search strategy type" },
        strategy_network: { type: "string", enum: ["SERVING_OFF", "NETWORK_DEFAULT", "WB_MAXIMUM_CLICKS", "WB_MAXIMUM_CONVERSION_RATE", "AVERAGE_CPC"], description: "Network strategy type" },
        weekly_spend_limit: { type: "number", description: "Weekly spend limit in rubles (for WB_ strategies and PAY_FOR_CONVERSION)" },
        goal_id: { type: "integer", description: "Metrika goal ID for conversion strategies" },
        goal_cpa: { type: "number", description: "Target CPA in rubles (for PAY_FOR_CONVERSION / AVERAGE_CPA)" },
        counter_ids: { type: "array", items: { type: "integer" }, description: "Yandex Metrika counter IDs" },
        priority_goals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              goal_id: { type: "integer" },
              value: { type: "number", description: "Goal value in rubles" },
            },
            required: ["goal_id", "value"],
          },
          description: "Priority goals with values for optimization",
        },
        negative_keywords: { type: "array", items: { type: "string" }, description: "Campaign-level negative keywords" },
        region_ids: { type: "array", items: { type: "integer" }, description: "Region IDs for targeting" },
      },
      required: ["name", "start_date"],
    },
  },
  {
    name: "yd_campaigns_update",
    description: "Update campaign settings (name, budget, strategy, status, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "integer", description: "Campaign ID" },
        name: { type: "string" },
        daily_budget_amount: { type: "number", description: "Daily budget in rubles" },
        daily_budget_mode: { type: "string", enum: ["STANDARD", "DISTRIBUTED"] },
        negative_keywords: { type: "array", items: { type: "string" } },
        end_date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["campaign_id"],
    },
  },
  {
    name: "yd_campaigns_action",
    description: "Suspend, resume, archive, or unarchive campaigns.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_ids: { type: "array", items: { type: "integer" }, description: "Campaign IDs" },
        action: { type: "string", enum: ["suspend", "resume", "archive", "unarchive"], description: "Action to perform" },
      },
      required: ["campaign_ids", "action"],
    },
  },
  {
    name: "yd_adgroups_add",
    description: "Create ad groups in a campaign.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "integer", description: "Campaign ID" },
        groups: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              region_ids: { type: "array", items: { type: "integer" }, description: "Region IDs (0 = all)" },
              negative_keywords: { type: "array", items: { type: "string" } },
            },
            required: ["name", "region_ids"],
          },
          description: "Array of ad groups to create",
        },
      },
      required: ["campaign_id", "groups"],
    },
  },
  {
    name: "yd_adgroups_get",
    description: "Get ad groups by campaign or group IDs.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_ids: { type: "array", items: { type: "integer" } },
        group_ids: { type: "array", items: { type: "integer" } },
      },
    },
  },
  {
    name: "yd_ads_add",
    description: "Create text ads in ad groups. Supports bulk creation, sitelinks, and images.",
    inputSchema: {
      type: "object",
      properties: {
        ads: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ad_group_id: { type: "integer" },
              title: { type: "string", description: "Ad title (max 56 chars)" },
              title2: { type: "string", description: "Second title (max 30 chars, optional)" },
              text: { type: "string", description: "Ad text (max 81 chars)" },
              href: { type: "string", description: "Landing page URL" },
              mobile: { type: "string", enum: ["YES", "NO"], description: "Mobile-only ad" },
              sitelink_set_id: { type: "integer", description: "Sitelink set ID to attach" },
              ad_image_hash: { type: "string", description: "Image hash (from yd_ad_images_add)" },
            },
            required: ["ad_group_id", "title", "text", "href"],
          },
        },
      },
      required: ["ads"],
    },
  },
  {
    name: "yd_ads_update",
    description: "Update existing text ads. Can change title, text, href, sitelinks, image, etc.",
    inputSchema: {
      type: "object",
      properties: {
        ads: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer", description: "Ad ID to update" },
              title: { type: "string", description: "New title (max 56 chars)" },
              title2: { type: "string", description: "New second title (max 30 chars)" },
              text: { type: "string", description: "New text (max 81 chars)" },
              href: { type: "string", description: "New landing page URL" },
              sitelink_set_id: { type: "integer", description: "Sitelink set ID" },
              ad_image_hash: { type: "string", description: "Image hash" },
            },
            required: ["id"],
          },
        },
      },
      required: ["ads"],
    },
  },
  {
    name: "yd_ads_get",
    description: "Get ads by campaign, ad group, or ad IDs.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_ids: { type: "array", items: { type: "integer" } },
        ad_group_ids: { type: "array", items: { type: "integer" } },
        ad_ids: { type: "array", items: { type: "integer" } },
      },
    },
  },
  {
    name: "yd_ads_action",
    description: "Moderate, suspend, resume, archive, or unarchive ads.",
    inputSchema: {
      type: "object",
      properties: {
        ad_ids: { type: "array", items: { type: "integer" } },
        action: { type: "string", enum: ["moderate", "suspend", "resume", "archive", "unarchive"] },
      },
      required: ["ad_ids", "action"],
    },
  },
  {
    name: "yd_keywords_add",
    description: "Add keywords to ad groups.",
    inputSchema: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ad_group_id: { type: "integer" },
              keyword: { type: "string", description: "Keyword phrase" },
              bid: { type: "number", description: "Search bid in rubles (optional)" },
            },
            required: ["ad_group_id", "keyword"],
          },
        },
      },
      required: ["keywords"],
    },
  },
  {
    name: "yd_keywords_get",
    description: "Get keywords by campaign, ad group, or keyword IDs.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_ids: { type: "array", items: { type: "integer" } },
        ad_group_ids: { type: "array", items: { type: "integer" } },
        keyword_ids: { type: "array", items: { type: "integer" } },
      },
    },
  },
  {
    name: "yd_keywords_research",
    description: "Deduplicate keywords: merge duplicates, eliminate overlapping phrases. Preprocesses keywords before adding to campaigns.",
    inputSchema: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "Array of keyword phrases to deduplicate",
        },
        operations: {
          type: "array",
          items: { type: "string", enum: ["MERGE_DUPLICATES", "ELIMINATE_OVERLAPPING"] },
          description: "Operations to perform (default: both)",
        },
      },
      required: ["keywords"],
    },
  },
  {
    name: "yd_bids_set",
    description: "Set bids for keywords.",
    inputSchema: {
      type: "object",
      properties: {
        bids: {
          type: "array",
          items: {
            type: "object",
            properties: {
              keyword_id: { type: "integer" },
              search_bid: { type: "number", description: "Search bid in rubles" },
              network_bid: { type: "number", description: "Network bid in rubles" },
            },
            required: ["keyword_id"],
          },
        },
      },
      required: ["bids"],
    },
  },
  {
    name: "yd_report",
    description: "Get campaign statistics report. Returns TSV data.",
    inputSchema: {
      type: "object",
      properties: {
        date_from: { type: "string", description: "YYYY-MM-DD" },
        date_to: { type: "string", description: "YYYY-MM-DD" },
        report_type: {
          type: "string",
          enum: [
            "ACCOUNT_PERFORMANCE_REPORT",
            "CAMPAIGN_PERFORMANCE_REPORT",
            "ADGROUP_PERFORMANCE_REPORT",
            "AD_PERFORMANCE_REPORT",
            "CRITERIA_PERFORMANCE_REPORT",
            "SEARCH_QUERY_PERFORMANCE_REPORT",
          ],
          description: "Report type",
        },
        field_names: {
          type: "array",
          items: { type: "string" },
          description: "Fields: CampaignName, AdGroupName, Impressions, Clicks, Cost, Ctr, AvgCpc, etc.",
        },
        campaign_ids: { type: "array", items: { type: "integer" }, description: "Filter by campaigns" },
      },
      required: ["date_from", "date_to", "report_type", "field_names"],
    },
  },
  {
    name: "yd_dictionaries",
    description: "Get reference data: regions, currencies, ad categories, etc.",
    inputSchema: {
      type: "object",
      properties: {
        names: {
          type: "array",
          items: {
            type: "string",
            enum: ["Currencies", "MetroStations", "GeoRegions", "TimeZones", "Constants", "AdCategories", "OperationSystemVersions", "SupplySidePlatforms", "Interests", "AudienceCriteriaTypes"],
          },
          description: "Dictionary names to retrieve",
        },
      },
      required: ["names"],
    },
  },
  {
    name: "yd_keywords_has_volume",
    description: "Check if keywords have search volume (impressions) in specified regions. Returns YES/NO per device type. Max 10000 keywords, max 20 requests per 60 seconds.",
    inputSchema: {
      type: "object",
      properties: {
        keywords: { type: "array", items: { type: "string" }, description: "Keywords to check (max 10000)" },
        region_ids: { type: "array", items: { type: "integer" }, description: "Region IDs (0 = all regions)" },
      },
      required: ["keywords", "region_ids"],
    },
  },
  {
    name: "yd_keyword_bids_get",
    description: "Get keyword bids and traffic forecasts.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_ids: { type: "array", items: { type: "integer" } },
        ad_group_ids: { type: "array", items: { type: "integer" } },
        keyword_ids: { type: "array", items: { type: "integer" } },
      },
    },
  },
  {
    name: "yd_keyword_bids_set",
    description: "Set keyword bids (search and network).",
    inputSchema: {
      type: "object",
      properties: {
        bids: {
          type: "array",
          items: {
            type: "object",
            properties: {
              keyword_id: { type: "integer" },
              search_bid: { type: "number", description: "Search bid in rubles" },
              network_bid: { type: "number", description: "Network bid in rubles" },
            },
            required: ["keyword_id"],
          },
        },
      },
      required: ["bids"],
    },
  },
  {
    name: "yd_keyword_bids_set_auto",
    description: "Set automatic bidding for keywords based on target position or other criteria.",
    inputSchema: {
      type: "object",
      properties: {
        bids: {
          type: "array",
          items: {
            type: "object",
            properties: {
              keyword_id: { type: "integer" },
              scope: { type: "string", enum: ["SEARCH", "NETWORK", "SEARCH_AND_NETWORK"] },
              position: { type: "string", enum: ["PREMIUMBLOCK", "FOOTERBLOCK", "P11", "P12", "P13", "P14", "P21", "P22", "P23", "P24"], description: "Target position" },
              max_bid: { type: "number", description: "Max bid in rubles" },
              increase_percent: { type: "integer", description: "Max increase percent (0-1200)" },
            },
            required: ["keyword_id"],
          },
        },
      },
      required: ["bids"],
    },
  },
  {
    name: "yd_bid_modifiers_add",
    description: "Add bid modifiers (adjustments) for demographics, devices, regions, etc.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "integer", description: "Campaign ID (or use ad_group_id)" },
        ad_group_id: { type: "integer", description: "Ad group ID (or use campaign_id)" },
        mobile_adjustment: { type: "integer", description: "Mobile bid modifier percent (0-1300, 0=disable)" },
        desktop_adjustment: { type: "integer", description: "Desktop bid modifier percent (0-1300)" },
        tablet_adjustment: { type: "integer", description: "Tablet bid modifier percent (0-1300)" },
        demographics: {
          type: "array",
          items: {
            type: "object",
            properties: {
              gender: { type: "string", enum: ["GENDER_MALE", "GENDER_FEMALE"] },
              age: { type: "string", enum: ["AGE_0_17", "AGE_18_24", "AGE_25_34", "AGE_35_44", "AGE_45_54", "AGE_55"] },
              bid_modifier: { type: "integer", description: "Modifier percent (0-1300)" },
            },
            required: ["bid_modifier"],
          },
          description: "Demographic adjustments (gender/age)",
        },
        regional: {
          type: "array",
          items: {
            type: "object",
            properties: {
              region_id: { type: "integer" },
              bid_modifier: { type: "integer", description: "Modifier percent (10-1300)" },
            },
            required: ["region_id", "bid_modifier"],
          },
          description: "Regional adjustments",
        },
      },
    },
  },
  {
    name: "yd_bid_modifiers_get",
    description: "Get bid modifiers for campaigns or ad groups.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_ids: { type: "array", items: { type: "integer" } },
        ad_group_ids: { type: "array", items: { type: "integer" } },
      },
    },
  },
  {
    name: "yd_bid_modifiers_set",
    description: "Update existing bid modifiers by their IDs.",
    inputSchema: {
      type: "object",
      properties: {
        modifiers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer", description: "BidModifier ID" },
              bid_modifier: { type: "integer", description: "New modifier percent" },
            },
            required: ["id", "bid_modifier"],
          },
        },
      },
      required: ["modifiers"],
    },
  },
  {
    name: "yd_bid_modifiers_delete",
    description: "Delete bid modifiers by IDs.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "integer" }, description: "BidModifier IDs to delete" },
      },
      required: ["ids"],
    },
  },
  {
    name: "yd_negative_keywords_sets_add",
    description: "Create shared negative keyword sets (max 30 total, reusable across campaigns).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Set name (max 255 chars)" },
        negative_keywords: { type: "array", items: { type: "string" }, description: "Negative keyword phrases" },
      },
      required: ["name", "negative_keywords"],
    },
  },
  {
    name: "yd_negative_keywords_sets_get",
    description: "Get shared negative keyword sets.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "integer" }, description: "Set IDs (empty = all)" },
      },
    },
  },
  {
    name: "yd_negative_keywords_sets_update",
    description: "Update a shared negative keyword set.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "Set ID" },
        name: { type: "string" },
        negative_keywords: { type: "array", items: { type: "string" } },
      },
      required: ["id"],
    },
  },
  {
    name: "yd_negative_keywords_sets_delete",
    description: "Delete shared negative keyword sets.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "integer" } },
      },
      required: ["ids"],
    },
  },
  {
    name: "yd_sitelinks_add",
    description: "Create sitelink sets (quick links under ads, 1-8 per set).",
    inputSchema: {
      type: "object",
      properties: {
        sitelinks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Link text (max 30 chars)" },
              href: { type: "string", description: "URL (max 1024 chars)" },
              description: { type: "string", description: "Description (max 60 chars, optional)" },
            },
            required: ["title", "href"],
          },
          description: "Array of 1-8 sitelinks",
        },
      },
      required: ["sitelinks"],
    },
  },
  {
    name: "yd_sitelinks_get",
    description: "Get sitelink sets by IDs.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "integer" }, description: "SitelinkSet IDs" },
      },
      required: ["ids"],
    },
  },
  {
    name: "yd_sitelinks_delete",
    description: "Delete sitelink sets.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "integer" } },
      },
      required: ["ids"],
    },
  },
  {
    name: "yd_ad_extensions_add",
    description: "Create ad extensions (callouts — short texts shown under ads, max 25 chars each).",
    inputSchema: {
      type: "object",
      properties: {
        callouts: {
          type: "array",
          items: { type: "string" },
          description: "Callout texts (max 25 chars each)",
        },
      },
      required: ["callouts"],
    },
  },
  {
    name: "yd_ad_extensions_get",
    description: "Get ad extensions by IDs.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "integer" } },
      },
      required: ["ids"],
    },
  },
  {
    name: "yd_ad_extensions_delete",
    description: "Delete ad extensions.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "integer" } },
      },
      required: ["ids"],
    },
  },
  {
    name: "yd_changes_check",
    description: "Check what changed since a given timestamp (campaigns, ad groups, ads, stats).",
    inputSchema: {
      type: "object",
      properties: {
        timestamp: { type: "string", description: "ISO 8601 timestamp, e.g. 2026-04-14T00:00:00Z" },
        campaign_ids: { type: "array", items: { type: "integer" }, description: "Campaign IDs to check (max 3000)" },
        field_names: {
          type: "array",
          items: { type: "string", enum: ["CampaignIds", "AdGroupIds", "AdIds", "CampaignsStat"] },
          description: "What changes to detect",
        },
      },
      required: ["timestamp", "field_names"],
    },
  },
  {
    name: "yd_audience_targets_add",
    description: "Add audience targeting conditions to ad groups (retargeting lists or interests).",
    inputSchema: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ad_group_id: { type: "integer" },
              retargeting_list_id: { type: "integer", description: "Retargeting list ID" },
              interest_id: { type: "integer", description: "Interest category ID (for mobile apps)" },
              context_bid: { type: "number", description: "Network bid in rubles" },
              strategy_priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH"] },
            },
            required: ["ad_group_id"],
          },
        },
      },
      required: ["targets"],
    },
  },
  {
    name: "yd_audience_targets_get",
    description: "Get audience targets by campaign, ad group, or target IDs.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_ids: { type: "array", items: { type: "integer" } },
        ad_group_ids: { type: "array", items: { type: "integer" } },
        ids: { type: "array", items: { type: "integer" } },
      },
    },
  },
  {
    name: "yd_audience_targets_delete",
    description: "Delete audience targeting conditions.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "integer" } },
      },
      required: ["ids"],
    },
  },
  {
    name: "yd_retargeting_lists_add",
    description: "Create retargeting/audience conditions based on Yandex Metrika goals or audience segments.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Condition name (max 250 chars)" },
        description: { type: "string", description: "Description (optional)" },
        rules: {
          type: "array",
          items: {
            type: "object",
            properties: {
              operator: { type: "string", enum: ["ALL", "ANY", "NONE"], description: "ALL=met all goals, ANY=at least one, NONE=none met" },
              goals: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    goal_id: { type: "integer", description: "Metrika goal or segment ID" },
                    membership_life_span: { type: "integer", description: "Days (1-540, or 0 for all time)" },
                  },
                  required: ["goal_id", "membership_life_span"],
                },
              },
            },
            required: ["operator", "goals"],
          },
          description: "Visitor selection rules",
        },
      },
      required: ["name", "rules"],
    },
  },
  {
    name: "yd_retargeting_lists_get",
    description: "Get retargeting lists.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "integer" } },
      },
    },
  },
  {
    name: "yd_retargeting_lists_delete",
    description: "Delete retargeting lists.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "integer" } },
      },
      required: ["ids"],
    },
  },
  {
    name: "yd_ad_images_add",
    description: "Upload ad images (base64-encoded). Max 100 per request (recommended <=3).",
    inputSchema: {
      type: "object",
      properties: {
        images: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Image name (max 255 chars)" },
              image_data: { type: "string", description: "Base64-encoded image data" },
            },
            required: ["name", "image_data"],
          },
        },
      },
      required: ["images"],
    },
  },
  {
    name: "yd_ad_images_get",
    description: "Get ad images by IDs or linked entities.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "Image hashes" },
        associated: { type: "boolean", description: "If true, get images linked to ads" },
      },
    },
  },
  {
    name: "yd_ad_images_delete",
    description: "Delete ad images by hashes.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "Image hashes to delete" },
      },
      required: ["ids"],
    },
  },
  {
    name: "yd_businesses_get",
    description: "Get organization profiles from Yandex Business linked to ads.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "integer" }, description: "Organization IDs (max 10000)" },
      },
      required: ["ids"],
    },
  },
  {
    name: "yd_clients_get",
    description: "Get advertiser account info (settings, balance, bonuses, etc.).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
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

  async yd_campaigns_add(args, ctx) {
    const campaign: Record<string, unknown> = {
      Name: args.name,
      StartDate: args.start_date,
    };
    if (args.end_date) campaign.EndDate = args.end_date;
    if (args.daily_budget_amount) {
      campaign.DailyBudget = {
        Amount: rublesToMicros(args.daily_budget_amount as number),
        Mode: args.daily_budget_mode ?? "DISTRIBUTED",
      };
    }
    if (args.negative_keywords) campaign.NegativeKeywords = { Items: args.negative_keywords };

    const weeklyLimit = args.weekly_spend_limit ? rublesToMicros(args.weekly_spend_limit as number) : null;
    const goalId = args.goal_id ?? null;
    const goalCpa = args.goal_cpa ? rublesToMicros(args.goal_cpa as number) : null;

    const searchStrategy = (args.strategy_search as string) ?? "WB_MAXIMUM_CLICKS";
    const searchObj: Record<string, unknown> = { BiddingStrategyType: searchStrategy };

    if (searchStrategy === "WB_MAXIMUM_CLICKS") {
      const p: Record<string, unknown> = {};
      p.WeeklySpendLimit = weeklyLimit ?? rublesToMicros(((args.daily_budget_amount as number) ?? 300) * 7);
      searchObj.WbMaximumClicks = p;
    } else if (searchStrategy === "PAY_FOR_CONVERSION") {
      const p: Record<string, unknown> = {};
      if (goalId) p.GoalId = goalId;
      if (goalCpa) p.Cpa = goalCpa;
      if (weeklyLimit) p.WeeklySpendLimit = weeklyLimit;
      searchObj.PayForConversion = p;
    } else if (searchStrategy === "PAY_FOR_CONVERSION_MULTIPLE_GOALS") {
      const p: Record<string, unknown> = {};
      if (weeklyLimit) p.WeeklySpendLimit = weeklyLimit;
      searchObj.PayForConversionMultipleGoals = p;
    } else if (searchStrategy === "WB_MAXIMUM_CONVERSION_RATE") {
      const p: Record<string, unknown> = {};
      if (weeklyLimit) p.WeeklySpendLimit = weeklyLimit;
      if (goalId) p.GoalId = goalId;
      searchObj.WbMaximumConversionRate = p;
    } else if (searchStrategy === "AVERAGE_CPA") {
      const p: Record<string, unknown> = {};
      if (goalId) p.GoalId = goalId;
      if (goalCpa) p.AverageCpa = goalCpa;
      if (weeklyLimit) p.WeeklySpendLimit = weeklyLimit;
      searchObj.AverageCpa = p;
    } else if (searchStrategy === "AVERAGE_CPC") {
      const p: Record<string, unknown> = {};
      if (weeklyLimit) p.WeeklySpendLimit = weeklyLimit;
      searchObj.AverageCpc = p;
    }

    const networkStrategy = (args.strategy_network as string) ?? "SERVING_OFF";
    const networkObj: Record<string, unknown> = { BiddingStrategyType: networkStrategy };

    if (networkStrategy === "WB_MAXIMUM_CONVERSION_RATE") {
      const p: Record<string, unknown> = {};
      if (weeklyLimit) p.WeeklySpendLimit = weeklyLimit;
      if (goalId) p.GoalId = goalId;
      networkObj.WbMaximumConversionRate = p;
    } else if (networkStrategy === "WB_MAXIMUM_CLICKS") {
      const p: Record<string, unknown> = {};
      if (weeklyLimit) p.WeeklySpendLimit = weeklyLimit;
      networkObj.WbMaximumClicks = p;
    } else if (networkStrategy === "NETWORK_DEFAULT") {
      networkObj.NetworkDefault = { LimitPercent: 100 };
    }

    const textCampaign: Record<string, unknown> = {
      BiddingStrategy: { Search: searchObj, Network: networkObj },
    };

    if (args.counter_ids) textCampaign.CounterIds = { Items: args.counter_ids };
    if (args.priority_goals) {
      textCampaign.PriorityGoals = {
        Items: (args.priority_goals as Array<{ goal_id: number; value: number }>).map((g) => ({
          GoalId: g.goal_id,
          Value: rublesToMicros(g.value),
        })),
      };
    }
    textCampaign.Settings = [
      { Option: "ADD_METRICA_TAG", Value: "YES" },
      { Option: "ENABLE_SITE_MONITORING", Value: "YES" },
    ];

    campaign.TextCampaign = textCampaign;
    const data = await callApi("campaigns", "add", { Campaigns: [campaign] }, ctx);
    return text(data.result ?? data);
  },

  async yd_campaigns_update(args, ctx) {
    const campaign: Record<string, unknown> = { Id: args.campaign_id };
    if (args.name) campaign.Name = args.name;
    if (args.daily_budget_amount) {
      campaign.DailyBudget = {
        Amount: rublesToMicros(args.daily_budget_amount as number),
        Mode: args.daily_budget_mode ?? "DISTRIBUTED",
      };
    }
    if (args.negative_keywords) campaign.NegativeKeywords = { Items: args.negative_keywords };
    if (args.end_date) campaign.EndDate = args.end_date;
    const data = await callApi("campaigns", "update", { Campaigns: [campaign] }, ctx);
    return text(data.result ?? data);
  },

  async yd_campaigns_action(args, ctx) {
    const action = args.action as string;
    const data = await callApi("campaigns", action, { SelectionCriteria: { Ids: args.campaign_ids } }, ctx);
    return text(data.result ?? data);
  },

  async yd_adgroups_add(args, ctx) {
    const groups = (args.groups as Array<Record<string, unknown>>).map((g) => {
      const group: Record<string, unknown> = {
        Name: g.name,
        CampaignId: args.campaign_id,
        RegionIds: g.region_ids,
      };
      if (g.negative_keywords) group.NegativeKeywords = { Items: g.negative_keywords };
      return group;
    });
    const data = await callApi("adgroups", "add", { AdGroups: groups }, ctx);
    return text(data.result ?? data);
  },

  async yd_adgroups_get(args, ctx) {
    const criteria: Record<string, unknown> = {};
    if (args.campaign_ids) criteria.CampaignIds = args.campaign_ids;
    if (args.group_ids) criteria.Ids = args.group_ids;
    const data = await callApi("adgroups", "get", {
      SelectionCriteria: criteria,
      FieldNames: ["Id", "Name", "CampaignId", "Status", "RegionIds", "NegativeKeywords"],
    }, ctx);
    return text(data.result ?? data);
  },

  async yd_ads_add(args, ctx) {
    const ads = (args.ads as Array<Record<string, unknown>>).map((a) => {
      const textAd: Record<string, unknown> = {
        Title: a.title,
        Text: a.text,
        Href: a.href,
        Mobile: a.mobile ?? "NO",
      };
      if (a.title2) textAd.Title2 = a.title2;
      if (a.sitelink_set_id) textAd.SitelinkSetId = a.sitelink_set_id;
      if (a.ad_image_hash) textAd.AdImageHash = a.ad_image_hash;
      return { AdGroupId: a.ad_group_id, TextAd: textAd };
    });
    const data = await callApi("ads", "add", { Ads: ads }, ctx);
    return text(data.result ?? data);
  },

  async yd_ads_update(args, ctx) {
    const ads = (args.ads as Array<Record<string, unknown>>).map((a) => {
      const textAd: Record<string, unknown> = {};
      if (a.title) textAd.Title = a.title;
      if (a.title2) textAd.Title2 = a.title2;
      if (a.text) textAd.Text = a.text;
      if (a.href) textAd.Href = a.href;
      if (a.sitelink_set_id) textAd.SitelinkSetId = a.sitelink_set_id;
      if (a.ad_image_hash) textAd.AdImageHash = a.ad_image_hash;
      return { Id: a.id, TextAd: textAd };
    });
    const data = await callApi("ads", "update", { Ads: ads }, ctx);
    return text(data.result ?? data);
  },

  async yd_ads_get(args, ctx) {
    const criteria: Record<string, unknown> = {};
    if (args.campaign_ids) criteria.CampaignIds = args.campaign_ids;
    if (args.ad_group_ids) criteria.AdGroupIds = args.ad_group_ids;
    if (args.ad_ids) criteria.Ids = args.ad_ids;
    const data = await callApi("ads", "get", {
      SelectionCriteria: criteria,
      FieldNames: ["Id", "AdGroupId", "CampaignId", "Status", "State", "Type"],
      TextAdFieldNames: ["Title", "Title2", "Text", "Href", "Mobile"],
    }, ctx);
    return text(data.result ?? data);
  },

  async yd_ads_action(args, ctx) {
    const action = args.action as string;
    const data = await callApi("ads", action, { SelectionCriteria: { Ids: args.ad_ids } }, ctx);
    return text(data.result ?? data);
  },

  async yd_keywords_add(args, ctx) {
    const keywords = (args.keywords as Array<Record<string, unknown>>).map((kw) => {
      const item: Record<string, unknown> = {
        Keyword: kw.keyword,
        AdGroupId: kw.ad_group_id,
      };
      if (kw.bid) item.Bid = rublesToMicros(kw.bid as number);
      return item;
    });
    const data = await callApi("keywords", "add", { Keywords: keywords }, ctx);
    return text(data.result ?? data);
  },

  async yd_keywords_get(args, ctx) {
    const criteria: Record<string, unknown> = {};
    if (args.campaign_ids) criteria.CampaignIds = args.campaign_ids;
    if (args.ad_group_ids) criteria.AdGroupIds = args.ad_group_ids;
    if (args.keyword_ids) criteria.Ids = args.keyword_ids;
    const data = await callApi("keywords", "get", {
      SelectionCriteria: criteria,
      FieldNames: ["Id", "Keyword", "AdGroupId", "CampaignId", "Status", "State", "Bid"],
    }, ctx);
    return text(data.result ?? data);
  },

  async yd_keywords_research(args, ctx) {
    const keywords = (args.keywords as string[]).map((kw) => ({ Keyword: kw }));
    const operations = (args.operations as string[]) ?? ["MERGE_DUPLICATES", "ELIMINATE_OVERLAPPING"];
    const data = await callApi("keywordsresearch", "deduplicate", { Keywords: keywords, Operation: operations }, ctx);
    return text(data.result ?? data);
  },

  async yd_bids_set(args, ctx) {
    const bids = (args.bids as Array<Record<string, unknown>>).map((b) => {
      const item: Record<string, unknown> = { KeywordId: b.keyword_id };
      if (b.search_bid) item.SearchBid = rublesToMicros(b.search_bid as number);
      if (b.network_bid) item.NetworkBid = rublesToMicros(b.network_bid as number);
      return item;
    });
    const data = await callApi("bids", "set", { Bids: bids }, ctx);
    return text(data.result ?? data);
  },

  async yd_report(args, ctx) {
    const body: Record<string, unknown> = {
      params: {
        SelectionCriteria: {
          DateFrom: args.date_from,
          DateTo: args.date_to,
          ...(args.campaign_ids
            ? { Filter: [{ Field: "CampaignId", Operator: "IN", Values: (args.campaign_ids as number[]).map(String) }] }
            : {}),
        },
        FieldNames: args.field_names,
        ReportName: `report_${args.date_from}_${args.date_to}`,
        ReportType: args.report_type,
        DateRangeType: "CUSTOM_DATE",
        Format: "TSV",
        IncludeVAT: "YES",
        IncludeDiscount: "NO",
      },
    };
    const headers: Record<string, string> = {
      Authorization: `Bearer ${currentToken()}`,
      "Accept-Language": "ru",
      "Content-Type": "application/json",
      "Client-Login": ctx.clientLogin || process.env.YD_LOGIN || "",
      processingMode: "auto",
      returnMoneyInMicros: "false",
    };
    const url = `${baseUrl()}/reports`;
    for (let i = 0; i < 30; i++) {
      const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
      if (resp.status === 200) return { content: [{ type: "text", text: await resp.text() }] };
      if (resp.status === 201 || resp.status === 202) {
        await new Promise((r) => setTimeout(r, Number(resp.headers.get("retryIn") || 5) * 1000));
        continue;
      }
      if (resp.status === 401 || resp.status === 403) throw new AuthError();
      return { content: [{ type: "text", text: `Report error ${resp.status}: ${await resp.text()}` }] };
    }
    return { content: [{ type: "text", text: "Report timeout after 30 attempts" }] };
  },

  async yd_dictionaries(args, ctx) {
    const data = await callApi("dictionaries", "get", { DictionaryNames: args.names }, ctx);
    return text(data.result ?? data);
  },

  async yd_keywords_has_volume(args, ctx) {
    const data = await callApi("keywordsresearch", "hasSearchVolume", {
      SelectionCriteria: {
        Keywords: args.keywords,
        RegionIds: args.region_ids,
      },
      FieldNames: ["Keyword", "RegionIds", "AllDevices", "MobilePhones", "Tablets", "Desktops"],
    }, ctx);
    return text(data.result ?? data);
  },

  async yd_keyword_bids_get(args, ctx) {
    const criteria: Record<string, unknown> = {};
    if (args.campaign_ids) criteria.CampaignIds = args.campaign_ids;
    if (args.ad_group_ids) criteria.AdGroupIds = args.ad_group_ids;
    if (args.keyword_ids) criteria.Ids = args.keyword_ids;
    const data = await callApi("keywordbids", "get", {
      SelectionCriteria: criteria,
      FieldNames: ["KeywordId", "AdGroupId", "CampaignId", "SearchBid", "NetworkBid", "CurrentSearchPrice", "MinSearchPrice"],
    }, ctx);
    return text(data.result ?? data);
  },

  async yd_keyword_bids_set(args, ctx) {
    const bids = (args.bids as Array<Record<string, unknown>>).map((b) => {
      const item: Record<string, unknown> = { KeywordId: b.keyword_id };
      if (b.search_bid) item.SearchBid = rublesToMicros(b.search_bid as number);
      if (b.network_bid) item.NetworkBid = rublesToMicros(b.network_bid as number);
      return item;
    });
    const data = await callApi("keywordbids", "set", { KeywordBids: bids }, ctx);
    return text(data.result ?? data);
  },

  async yd_keyword_bids_set_auto(args, ctx) {
    const bids = (args.bids as Array<Record<string, unknown>>).map((b) => {
      const item: Record<string, unknown> = { KeywordId: b.keyword_id };
      const auto: Record<string, unknown> = {};
      if (b.scope) auto.Scope = [b.scope];
      if (b.position) auto.Position = b.position;
      if (b.max_bid) auto.MaxBid = rublesToMicros(b.max_bid as number);
      if (b.increase_percent) auto.IncreasePercent = b.increase_percent;
      item.SearchAutoStrategy = auto;
      return item;
    });
    const data = await callApi("keywordbids", "setAuto", { KeywordBids: bids }, ctx);
    return text(data.result ?? data);
  },

  async yd_bid_modifiers_add(args, ctx) {
    const modifier: Record<string, unknown> = {};
    if (args.campaign_id) modifier.CampaignId = args.campaign_id;
    if (args.ad_group_id) modifier.AdGroupId = args.ad_group_id;
    if (args.mobile_adjustment != null) modifier.MobileAdjustment = { BidModifier: args.mobile_adjustment };
    if (args.desktop_adjustment != null) modifier.DesktopAdjustment = { BidModifier: args.desktop_adjustment };
    if (args.tablet_adjustment != null) modifier.TabletAdjustment = { BidModifier: args.tablet_adjustment };
    if (args.demographics) {
      modifier.DemographicsAdjustments = (args.demographics as Array<Record<string, unknown>>).map((d) => {
        const entry: Record<string, unknown> = { BidModifier: d.bid_modifier };
        if (d.gender != null) entry.Gender = d.gender;
        if (d.age != null) entry.Age = d.age;
        return entry;
      });
    }
    if (args.regional) {
      modifier.RegionalAdjustments = (args.regional as Array<Record<string, unknown>>).map((r) => ({
        RegionId: r.region_id,
        BidModifier: r.bid_modifier,
      }));
    }
    const data = await callApi("bidmodifiers", "add", { BidModifiers: [modifier] }, ctx);
    return text(data.result ?? data);
  },

  async yd_bid_modifiers_get(args, ctx) {
    const criteria: Record<string, unknown> = {};
    if (args.campaign_ids) criteria.CampaignIds = args.campaign_ids;
    if (args.ad_group_ids) criteria.AdGroupIds = args.ad_group_ids;
    const data = await callApi("bidmodifiers", "get", {
      SelectionCriteria: criteria,
      FieldNames: ["Id", "CampaignId", "AdGroupId", "Type",
        "MobileAdjustment", "DesktopAdjustment", "TabletAdjustment",
        "DemographicsAdjustments", "RegionalAdjustments"],
    }, ctx);
    return text(data.result ?? data);
  },

  async yd_bid_modifiers_set(args, ctx) {
    const mods = (args.modifiers as Array<Record<string, unknown>>).map((m) => ({
      Id: m.id,
      BidModifier: m.bid_modifier,
    }));
    const data = await callApi("bidmodifiers", "set", { BidModifiers: mods }, ctx);
    return text(data.result ?? data);
  },

  async yd_bid_modifiers_delete(args, ctx) {
    const data = await callApi("bidmodifiers", "delete", { SelectionCriteria: { Ids: args.ids } }, ctx);
    return text(data.result ?? data);
  },

  async yd_negative_keywords_sets_add(args, ctx) {
    const item = {
      Name: args.name,
      NegativeKeywords: args.negative_keywords,
    };
    const data = await callApi("negativekeywordsharedsets", "add", { NegativeKeywordSharedSets: [item] }, ctx);
    return text(data.result ?? data);
  },

  async yd_negative_keywords_sets_get(args, ctx) {
    const criteria: Record<string, unknown> = {};
    if (args.ids) criteria.Ids = args.ids;
    const data = await callApi("negativekeywordsharedsets", "get", {
      SelectionCriteria: criteria,
      FieldNames: ["Id", "Name", "NegativeKeywords"],
    }, ctx);
    return text(data.result ?? data);
  },

  async yd_negative_keywords_sets_update(args, ctx) {
    const item: Record<string, unknown> = { Id: args.id };
    if (args.name) item.Name = args.name;
    if (args.negative_keywords) item.NegativeKeywords = args.negative_keywords;
    const data = await callApi("negativekeywordsharedsets", "update", { NegativeKeywordSharedSets: [item] }, ctx);
    return text(data.result ?? data);
  },

  async yd_negative_keywords_sets_delete(args, ctx) {
    const data = await callApi("negativekeywordsharedsets", "delete", { SelectionCriteria: { Ids: args.ids } }, ctx);
    return text(data.result ?? data);
  },

  async yd_sitelinks_add(args, ctx) {
    const sitelinks = (args.sitelinks as Array<Record<string, unknown>>).map((s) => {
      const sl: Record<string, unknown> = { Title: s.title, Href: s.href };
      if (s.description) sl.Description = s.description;
      return sl;
    });
    const data = await callApi("sitelinks", "add", { SitelinksSets: [{ Sitelinks: sitelinks }] }, ctx);
    return text(data.result ?? data);
  },

  async yd_sitelinks_get(args, ctx) {
    const data = await callApi("sitelinks", "get", {
      SelectionCriteria: { Ids: args.ids },
      FieldNames: ["Id", "Sitelinks"],
    }, ctx);
    return text(data.result ?? data);
  },

  async yd_sitelinks_delete(args, ctx) {
    const data = await callApi("sitelinks", "delete", { SelectionCriteria: { Ids: args.ids } }, ctx);
    return text(data.result ?? data);
  },

  async yd_ad_extensions_add(args, ctx) {
    const extensions = (args.callouts as string[]).map((calloutText) => ({
      Callout: { CalloutText: calloutText },
    }));
    const data = await callApi("adextensions", "add", { AdExtensions: extensions }, ctx);
    return text(data.result ?? data);
  },

  async yd_ad_extensions_get(args, ctx) {
    const data = await callApi("adextensions", "get", {
      SelectionCriteria: { Ids: args.ids },
      FieldNames: ["Id", "Type", "Callout", "Status"],
    }, ctx);
    return text(data.result ?? data);
  },

  async yd_ad_extensions_delete(args, ctx) {
    const data = await callApi("adextensions", "delete", { SelectionCriteria: { Ids: args.ids } }, ctx);
    return text(data.result ?? data);
  },

  async yd_changes_check(args, ctx) {
    const params: Record<string, unknown> = {
      Timestamp: args.timestamp,
      FieldNames: args.field_names,
    };
    if (args.campaign_ids) params.CampaignIds = args.campaign_ids;
    const data = await callApi("changes", "check", params, ctx);
    return text(data.result ?? data);
  },

  async yd_audience_targets_add(args, ctx) {
    const targets = (args.targets as Array<Record<string, unknown>>).map((t) => {
      const item: Record<string, unknown> = { AdGroupId: t.ad_group_id };
      if (t.retargeting_list_id) item.RetargetingListId = t.retargeting_list_id;
      if (t.interest_id) item.InterestId = t.interest_id;
      if (t.context_bid) item.ContextBid = rublesToMicros(t.context_bid as number);
      if (t.strategy_priority) item.StrategyPriority = t.strategy_priority;
      return item;
    });
    const data = await callApi("audiencetargets", "add", { AudienceTargets: targets }, ctx);
    return text(data.result ?? data);
  },

  async yd_audience_targets_get(args, ctx) {
    const criteria: Record<string, unknown> = {};
    if (args.campaign_ids) criteria.CampaignIds = args.campaign_ids;
    if (args.ad_group_ids) criteria.AdGroupIds = args.ad_group_ids;
    if (args.ids) criteria.Ids = args.ids;
    const data = await callApi("audiencetargets", "get", {
      SelectionCriteria: criteria,
      FieldNames: ["Id", "AdGroupId", "CampaignId", "RetargetingListId", "InterestId", "ContextBid", "StrategyPriority", "State"],
    }, ctx);
    return text(data.result ?? data);
  },

  async yd_audience_targets_delete(args, ctx) {
    const data = await callApi("audiencetargets", "delete", { SelectionCriteria: { Ids: args.ids } }, ctx);
    return text(data.result ?? data);
  },

  async yd_retargeting_lists_add(args, ctx) {
    const rules = (args.rules as Array<Record<string, unknown>>).map((r) => ({
      Operator: r.operator,
      Arguments: (r.goals as Array<{ goal_id: number; membership_life_span: number }>).map((g) => ({
        ExternalId: g.goal_id,
        MembershipLifeSpan: g.membership_life_span,
      })),
    }));
    const item: Record<string, unknown> = {
      Name: args.name,
      Rules: rules,
    };
    if (args.description) item.Description = args.description;
    const data = await callApi("retargetinglists", "add", { RetargetingLists: [item] }, ctx);
    return text(data.result ?? data);
  },

  async yd_retargeting_lists_get(args, ctx) {
    const criteria: Record<string, unknown> = {};
    if (args.ids) criteria.Ids = args.ids;
    const data = await callApi("retargetinglists", "get", {
      SelectionCriteria: criteria,
      FieldNames: ["Id", "Name", "Description", "Rules", "Type", "IsAvailable"],
    }, ctx);
    return text(data.result ?? data);
  },

  async yd_retargeting_lists_delete(args, ctx) {
    const data = await callApi("retargetinglists", "delete", { SelectionCriteria: { Ids: args.ids } }, ctx);
    return text(data.result ?? data);
  },

  async yd_ad_images_add(args, ctx) {
    const images = (args.images as Array<{ name: string; image_data: string }>).map((img) => ({
      ImageData: img.image_data,
      Name: img.name,
    }));
    const data = await callApi("adimages", "add", { AdImages: images }, ctx);
    return text(data.result ?? data);
  },

  async yd_ad_images_get(args, ctx) {
    const criteria: Record<string, unknown> = {};
    if (args.ids) criteria.AdImageHashes = args.ids;
    if (args.associated) criteria.Associated = "YES";
    const data = await callApi("adimages", "get", {
      SelectionCriteria: criteria,
      FieldNames: ["AdImageHash", "Name", "Type", "Subtype", "OriginalUrl"],
    }, ctx);
    return text(data.result ?? data);
  },

  async yd_ad_images_delete(args, ctx) {
    const data = await callApi("adimages", "delete", { SelectionCriteria: { AdImageHashes: args.ids } }, ctx);
    return text(data.result ?? data);
  },

  async yd_businesses_get(args, ctx) {
    const data = await callApi("businesses", "get", {
      SelectionCriteria: { Ids: args.ids },
      FieldNames: ["Id", "Name", "Address", "Phone", "ProfileUrl", "IsPublished"],
    }, ctx);
    return text(data.result ?? data);
  },

  async yd_clients_get(args, ctx) {
    const data = await callApi("clients", "get", {
      FieldNames: ["Login", "ClientId", "CountryId", "Currency", "ClientInfo",
        "Notification", "Phone", "Representatives", "Restrictions",
        "Settings", "AccountQuality"],
    }, ctx);
    return text(data.result ?? data);
  },
};
