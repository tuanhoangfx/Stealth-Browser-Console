/** Golden analytics band titles — uppercase via `.hub-analytics-caption`. */
export const GOLDEN_CHART_PANEL_TITLES: Record<string, string> = {
  health_bar: "By Health",
  category_bar: "By Category",
  deploy_bar: "Deploy distribution",
  status_bar: "Status distribution",
  role_bar: "By Role",
  activity_bar: "By Activity",
  tool_bar: "Tool access",
  distribution_bar: "Activity distribution",
  kind_bar: "By kind",
  scope_bar: "By scope",
  apply_bar: "By apply mode",
  size_bar: "By size",
  mode_bar: "By mode",
  group_bar: "By group",
  template_bar: "By template",
  pages_bar: "By pages",
  seller_bar: "By seller",
  status_chart: "By status",
  pay_donut: "Pay distribution",
  pay_bar: "By pay status",
  revenue_chart: "Revenue",
  top_products: "Top products",
  cat_bar: "By category",
  platform_bar: "Routes by platform",
  share_bar: "Route share",
  priority_bar: "Tasks by priority",
  service_bar: "Top services",
  identity_bar: "Account identity",
  usage_bar: "Usage",
  password_bar: "Password saved",
  runtime_bar: "By runtime",
  session_bar: "By session",
  zalo_bar: "Zalo account",
  active_bar: "Active bot",
  members_bar: "By members",
  allowlist_bar: "Allowlist",
  top_bar: "Top groups",
  listed_bar: "Listed vs off",
  type_bar: "By type",
  connect_bar: "Connected",
  channel_bar: "By channel",
  unread_bar: "Unread vs read",
  source_bar: "By source",
  reply_bar: "Reply performance",
  inbox_over_time: "Inbox over time",
  hourly_spark: "Inbox over time",
  new_bar: "New conversations",
  status_donut: "Status distribution",
  daily_bar: "Daily revenue",
  tier_bar: "By tier",
  tier_donut: "Tier distribution",
  seller_donut: "Seller distribution",
  cat_donut: "Category distribution",
  top_donut: "Top revenue",
  revenue_top_donut: "Revenue by top product",
};

/** Strip Display Prefs suffix e.g. `By group (bar)` → `By group`. */
export function chartPanelTitleFromPrefLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

export function chartPanelTitleFromDefs<T extends string>(
  defs: readonly { key: T; label: string }[],
  key: T,
): string {
  const golden = GOLDEN_CHART_PANEL_TITLES[key];
  if (golden) return golden;
  const item = defs.find((d) => d.key === key);
  return item ? chartPanelTitleFromPrefLabel(item.label) : key;
}
