// test/parity.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_TOOLS } from "../src/index.ts";

const EXPECTED = [
  // auth (3)
  "yd_auth_status", "yd_set_client_id", "yd_set_token",
  // direct core (46)
  "yd_campaigns_get","yd_campaigns_add","yd_campaigns_update","yd_campaigns_action",
  "yd_adgroups_add","yd_adgroups_get","yd_ads_add","yd_ads_update","yd_ads_get","yd_ads_action",
  "yd_keywords_add","yd_keywords_get","yd_keywords_research","yd_bids_set","yd_report","yd_dictionaries",
  "yd_keywords_has_volume","yd_keyword_bids_get","yd_keyword_bids_set","yd_keyword_bids_set_auto",
  "yd_bid_modifiers_add","yd_bid_modifiers_get","yd_bid_modifiers_set","yd_bid_modifiers_delete",
  "yd_negative_keywords_sets_add","yd_negative_keywords_sets_get","yd_negative_keywords_sets_update","yd_negative_keywords_sets_delete",
  "yd_sitelinks_add","yd_sitelinks_get","yd_sitelinks_delete",
  "yd_ad_extensions_add","yd_ad_extensions_get","yd_ad_extensions_delete","yd_changes_check",
  "yd_audience_targets_add","yd_audience_targets_get","yd_audience_targets_delete",
  "yd_retargeting_lists_add","yd_retargeting_lists_get","yd_retargeting_lists_delete",
  "yd_ad_images_add","yd_ad_images_get","yd_ad_images_delete","yd_businesses_get","yd_clients_get",
  // direct extra (26)
  "yd_vcards_add","yd_vcards_get","yd_vcards_delete",
  "yd_feeds_add","yd_feeds_get","yd_feeds_update","yd_feeds_delete",
  "yd_smart_targets_add","yd_smart_targets_get","yd_smart_targets_action",
  "yd_ads_add_dynamic","yd_ads_add_image","yd_ads_add_shopping",
  "yd_videos_upload","yd_videos_get","yd_creatives_add","yd_creatives_get",
  "yd_callouts_link","yd_bid_modifiers_toggle","yd_adgroups_update","yd_regions_get","yd_interests_get",
  "yd_excluded_sites_get","yd_excluded_sites_update","yd_blocked_ips_update","yd_campaign_strategy_update",
  // wordstat (5)
  "yd_wordstat_top_requests","yd_wordstat_dynamics","yd_wordstat_regions","yd_wordstat_regions_tree","yd_wordstat_user_info",
  // metrika (43)
  "yd_metrika_counters_get","yd_metrika_counter_get","yd_metrika_counter_create","yd_metrika_counter_update","yd_metrika_counter_delete",
  "yd_metrika_goals_get","yd_metrika_goal_create","yd_metrika_goal_update","yd_metrika_goal_delete",
  "yd_metrika_segments_get","yd_metrika_segment_create","yd_metrika_segment_update","yd_metrika_segment_delete",
  "yd_metrika_filters_get","yd_metrika_filter_create","yd_metrika_filter_update","yd_metrika_filter_delete",
  "yd_metrika_grants_get","yd_metrika_grant_add","yd_metrika_grant_update","yd_metrika_grant_delete",
  "yd_metrika_report","yd_metrika_report_by_time","yd_metrika_report_comparison","yd_metrika_report_drilldown",
  "yd_metrika_upload_conversions","yd_metrika_conversions_status","yd_metrika_upload_calls","yd_metrika_upload_expenses","yd_metrika_upload_user_params",
  "yd_metrika_labels_get","yd_metrika_label_create","yd_metrika_label_update","yd_metrika_label_delete",
  "yd_metrika_label_link","yd_metrika_label_unlink",
  "yd_metrika_annotations_get","yd_metrika_annotation_create","yd_metrika_annotation_update","yd_metrika_annotation_delete",
  "yd_metrika_delegates_get","yd_metrika_delegate_add","yd_metrika_delegate_delete",
  // webmaster (30)
  "yd_webmaster_user_get","yd_webmaster_hosts_get","yd_webmaster_host_add","yd_webmaster_host_get","yd_webmaster_host_delete",
  "yd_webmaster_host_summary","yd_webmaster_verification_get","yd_webmaster_verification_start","yd_webmaster_owners_get","yd_webmaster_diagnostics_get",
  "yd_webmaster_sqi_history","yd_webmaster_sitemaps_get","yd_webmaster_user_sitemaps_get","yd_webmaster_user_sitemap_add","yd_webmaster_user_sitemap_delete",
  "yd_webmaster_indexing_history","yd_webmaster_indexing_samples","yd_webmaster_insearch_history","yd_webmaster_insearch_samples","yd_webmaster_search_events_samples",
  "yd_webmaster_search_queries_popular","yd_webmaster_search_queries_history","yd_webmaster_external_links_samples","yd_webmaster_external_links_history","yd_webmaster_broken_links_samples",
  "yd_webmaster_recrawl_submit","yd_webmaster_recrawl_list","yd_webmaster_recrawl_task","yd_webmaster_recrawl_quota","yd_webmaster_important_urls",
];

test("ALL_TOOLS has exactly the expected 153 tool names", () => {
  const actual = ALL_TOOLS.map((t) => t.name).sort();
  const expected = [...EXPECTED].sort();
  assert.equal(actual.length, 153);
  assert.deepEqual(actual, expected);
});

test("every tool has a handler registered", async () => {
  const { HANDLERS } = await import("../src/index.ts");
  for (const t of ALL_TOOLS) assert.ok(HANDLERS[t.name], `missing handler: ${t.name}`);
});
