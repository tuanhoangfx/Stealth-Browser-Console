export { HubDisplayPrefs } from "./display-prefs/HubDisplayPrefs";
export { HubDirectoryDisplayPanel, HubDisplayBandToolbar, type HubDirectoryDisplayPanelProps, type HubDisplayBandToolbarProps } from "./display-prefs/HubDirectoryDisplayPanel";
export { HubDisplayVisibilityMenu, type HubDisplayVisibilityMenuProps } from "./display-prefs/HubDisplayVisibilityMenu";
export {
  countVisiblePrefs,
  defaultsForPrefItems,
  isHubPrefVisible,
  toggleHubPrefSet,
} from "./display-prefs/hub-display-visibility";
export { HubSettingsExtras, type HubSettingsExtrasProps } from "./display-prefs/HubSettingsExtras";
export { Section, SectionIcon, SettingsSubsection, TabButton, ToggleRow } from "./display-prefs/primitives";
export { SettingsOptionFilter, type SettingsOptionFilterProps } from "./display-prefs/SettingsOptionFilter";
export { LIMIT_OPTIONS, TIME_RANGES, type TimeRange } from "./display-prefs/constants";
export {
  CHART_KEY_MIGRATION,
  migrateChartKeyList,
  migrateChartKeySet,
  migrateChartKeysWithPersist,
  serializeChartKeySet,
} from "./display-prefs/chart-key-migrate";
export {
  MAX_VISIBLE_CHART,
  defaultChartKeysFromDefs,
  enforceChartMaxOnAdd,
  resolveVisibleChartKeys,
  useResolvedVisibleChartKeys,
} from "./display-prefs/chart-visible";
export {
  DEFAULT_KPI_ON_COUNT,
  MAX_VISIBLE_KPI,
  defaultKpiKeysExcluding,
  defaultKpiKeysFromDefs,
  enforceKpiMaxOnAdd,
  resolveVisibleKpiKeys,
  useResolvedVisibleKpiKeys,
} from "./display-prefs/kpi-visible";
export {
  barChartSeriesSignature,
  chartKeysSignature,
  kpiTilesSignature,
  visibleKpiKeysSignature,
} from "./directory-band/directory-band-sync";
export {
  useDirectoryBandSync,
  type DirectoryBandHandlers,
  type DirectoryBandSyncSnapshot,
} from "./directory-band/useDirectoryBandSync";
export {
  useWorkspaceDirectoryChrome,
  DirectoryBootGate,
  HUB_LARGE_DIRECTORY_BOOT_THRESHOLD,
  needsLargeDirectoryBoot,
  type DirectoryBootGateProps,
  type WorkspaceDirectoryChromeHandlers,
  type WorkspaceDirectoryChromeSnapshot,
} from "./directory-band/useWorkspaceDirectoryChrome";
export type {
  DisplayPrefsPrefs,
  HubDisplayPrefsProps,
  HubDisplayPrefsToolSection,
  PrefItem,
  PrefIcon,
  SettingsExtraTab,
  SubTabDisplayConfig,
  SystemDisplayAdapter,
} from "./display-prefs/types";
export { SUBTAB_DISPLAY_CHANGE } from "./display-prefs/types";
export {
  withPrefItemIcons,
  withDirectoryColumnIcons,
  prefIconMapFromDirectoryColumnHeaderMeta,
  prefIconMapFromHubDirectoryColumnMeta,
  buildDirectoryColumnItemsFromRoles,
  buildDirectoryColumnItemsFromHeaderMeta,
  type PrefIconMap,
  type PrefIconMeta,
  type DirectoryColumnRoleDef,
} from "./display-prefs/pref-item-icons";
export { createDynamicDirectoryTableColumnPrefs } from "./prefs/create-dynamic-directory-table-column-prefs";
export {
  countHiddenDirectoryTableColumns,
  createDirectoryTableColumnPrefs,
  mergeDirectoryTableColumnOrder,
  parseDirectoryTableColumnPrefsStorage,
  serializeDirectoryTableColumnPrefsStorage,
  type DirectoryTableColumnItem,
  type DirectoryTableColumnPrefs,
} from "./prefs/directory-table-column-prefs";
export {
  createDirectoryTableColumnPresetManager,
  directoryTableColumnStatesEqual,
  asDirectoryTableColumnPresetManagerProp,
  type DirectoryTableColumnPreset,
  type DirectoryTableColumnPresetManager,
  type DirectoryTableColumnPresetManagerProp,
} from "./prefs/directory-table-column-presets";
export {
  HubDirectoryTableColumnPresetMenu,
  type HubDirectoryTableColumnPresetMenuProps,
} from "./prefs/HubDirectoryTableColumnPresetMenu";
export {
  DirectoryTableColumnsSettings,
  type DirectoryTableColumnsSettingsProps,
} from "./prefs/DirectoryTableColumnsSettings";
export { DirectoryTableColumnsResetAction } from "./prefs/DirectoryTableColumnsResetAction";
export { compactIconSize, HUB_CHROME_ICON_PX, HUB_COMPACT_SCALE, HUB_DIRECTORY_HEADER_GLYPH_PX } from "./ui-scale";
export { deployLabel } from "./lib/deploy-label";
export { formatTabHeaderTimestamp } from "./lib/tab-header-timestamp";
export {
  resolveAppVersionReleaseMeta,
  parseChangelogReleaseTimestamp,
  normalizeChangelogTimestampRaw,
  type AppVersionReleaseMeta,
  type ToolManifestReleaseSlice,
} from "./lib/app-version-release-meta";
export {
  buildConsoleVersionMetaItems,
  buildConsoleVersionMetaItemsLegacy,
} from "./shell/console-version-meta";
export {
  CATEGORY,
  DEPLOY,
  DRIFT,
  FIELD_KEY,
  HUB_KPI,
  LINK_KIND,
  LINK_KIND_LABEL,
  LINKS,
  LINK_STATUS,
  LINK_STATUS_LABEL,
  LINK_STATUS_TONE,
  MODE_LABEL_SHORT,
  SCHEMA_GROUP,
  SCHEMA_MODE,
  STATUS_HEALTH,
  pickBadgeIcon,
  resolveCategoryDisplayIcon,
  resolveChartLegendIcon,
  resolveDeployBadge,
  resolveDeployTargetIcon,
  resolveDriftChipIcon,
  resolveDriftCleanIcon,
  resolveFieldSpecIcon,
  resolveHealthStatusIcon,
  resolveHubKpiIcon,
  resolveLinkGapChipIcon,
  resolveLinkKindBadge,
  resolveLinkStatusBadge,
  resolveLocalOnlyIcon,
  resolveLocalPortIcon,
  resolveSchemaGroupIcon,
  resolveSchemaModeIcon,
  type BadgeSpec,
  type SchemaMode,
} from "./lib/badge-registry-core";
export {
  applyHubUserZoomPct,
  HUB_USER_ZOOM_DEFAULT,
  HUB_USER_ZOOM_MAX,
  HUB_USER_ZOOM_MIN,
  HUB_USER_ZOOM_STEPS,
  hubUserZoomStepIndex,
  initHubUserZoom,
  readHubUserZoomPct,
  type HubUserZoomPct,
} from "./hub-user-zoom";
export { HubUiZoomControl } from "./shell/HubUiZoomControl";
export {
  hideBootLoader,
  ensureHubTabLoaderRoot,
  HUB_BOOT_LOADER_ID,
  HUB_TAB_LOADER_ROOT_ID,
} from "./loading/hub-loader-dom";
export { mountHubApp } from "./loading/mount-hub-app";
export { HubLoaderRoot } from "./shell/HubLoaderRoot";
export {
  HubMainChromeInsetSync,
  HubMainChromeStack,
} from "./shell/HubMainChromeInset";
export { useHubMainChromeInset } from "./shell/useHubMainChromeInset";
export { syncHubMainChromeInset, HUB_MAIN_CHROME_TOP_VAR } from "./loading/hub-main-chrome-inset";
export { HubLoadingView, type HubLoadingViewProps } from "./shell/HubLoadingView";
export {
  HubScreenChunkFallback,
  type HubScreenChunkFallbackProps,
} from "./shell/HubScreenChunkFallback";
export { CacheHitBadge } from "./shell/CacheHitBadge";
export { HubHealthChip, type HubHealthChipProps, type HubSyncHealth } from "./shell/HubHealthChip";
export {
  hubThreadPreviewFromContent,
  resolveHubThreadPreview,
  type HubThreadPreview,
  type HubThreadPreviewSource,
} from "./thread/hub-thread-preview";
export { HubThreadPreviewThumb, type HubThreadPreviewThumbProps } from "./thread/HubThreadPreviewThumb";
export {
  FilterBar,
  HubMultiFilterDropdown,
  HubSingleFilterDropdown,
  type FilterBarProps,
  type FilterDef,
  type FilterOption,
  type FilterValues,
  type HubMultiFilterDropdownProps,
  type HubSingleFilterDropdownProps,
} from "./shell/FilterBar";
export {
  HubModalDirectoryFilterBar,
  type HubModalDirectoryFilterBarProps,
} from "./shell/HubModalDirectoryFilterBar";
export {
  HubTableCellFilterDropdown,
  type HubTableCellFilterDropdownProps,
} from "./shell/HubTableCellFilterDropdown";
export {
  HUB_FILTER_DROPDOWN_LIST_CLASS,
  HUB_SCROLLBAR_CLASS,
  HUB_FILTER_DROPDOWN_PANEL_CLASS,
  HUB_FILTER_DROPDOWN_PANEL_PORTAL_CLASS,
  HUB_FILTER_DROPDOWN_ROW_CLASS,
  HUB_FILTER_DROPDOWN_ROW_COMPACT_CLASS,
  HUB_FILTER_DROPDOWN_ROW_DIRECTORY_VALUE_CLASS,
  hubFilterDropdownRowClass,
  hubFilterUsesDirectoryValueTypo,
  hubFilterDirectoryTriggerTypoClass,
  hubFilterGlyphPx,
  HubFilterDropdownCircle,
  HubFilterDropdownPanelSearch,
  HubFilterDropdownTrigger,
  HUB_FILTER_OPTION_EMOJI_CLASS,
  hubFilterOptionEmojiClass,
  HUB_FILTER_DROPDOWN_TRIGGER_COMPACT_TYPO_CLASS,
  HUB_FILTER_DROPDOWN_TRIGGER_DIRECTORY_HEADER_TYPO_CLASS,
  HUB_FILTER_DROPDOWN_TRIGGER_DIRECTORY_VALUE_TYPO_CLASS,
  HUB_FILTER_BRAND_ICON_CLASS,
  hubBrandIconImgClass,
  type HubBrandIconShell,
  filterDropdownPanelSearchPlaceholder,
  folderFilterButtonLabel,
  multiFilterTriggerTitle,
  hubFilterTriggerClass,
} from "./shell/filter-dropdown-primitives";
export {
  configureDirectoryFilterColumnRoles,
  resolveDirectoryFilterColumnIcon,
} from "./shell/filter-directory-column-roles";
export { enrichFilterDefs } from "./lib/filter-option-counts";
export {
  fetchWorkspaceUserDirectoryRows,
  workspaceDirectoryRowToProfile,
  type WorkspaceDirectoryProfile,
  type WorkspaceUserDirectoryRow,
} from "./lib/workspace-user-directory";
export {
  configureHubUrlPrefs,
  getHubUrlPrefsDefaults,
  HUB_LIST_PREFS_CHANGE_EVENT,
  HUB_URL_DEFAULT_LIMIT,
  HUB_URL_DEFAULT_RANGE,
  parseHubChartPrefSet,
  parseHubPrefSet,
  patchHubListPrefs,
  readHubListPrefsCore,
  subscribeHubListPrefs,
  type HubListPrefsCore,
  type HubUrlPrefsConfig,
} from "./lib/hub-url-prefs";
export {
  directoryActivityIso,
  matchesDirectoryActivityAt,
  matchesDirectoryTimeRange,
  resolveDirectoryTimeRange,
  useDirectoryTimeRange,
} from "./lib/directory-time-range";
export {
  ANALYTICS_BAND_MAX,
  clampBandSlotCount,
  countAnalyticsBandSlots,
} from "./lib/analytics-band-count";
export { ChartsBand, resolveChartsBandCount } from "./shell/ChartsBand";
export { resolveKpiStripCount } from "./shell/KpiStrip";
export { HubTimeRangeSelect } from "./shell/HubTimeRangeSelect";
export {
  HubPeriodSelect,
  HubMonthPickerPanel,
  type HubPeriodSelectProps,
  type HubPeriodOption,
} from "./shell/HubPeriodSelect";
export {
  HubWorkspacePeriodSelect,
  type HubWorkspacePeriodSelectProps,
} from "./shell/HubWorkspacePeriodSelect";
export {
  matchesWorkspacePeriod,
  normalizeWorkspacePeriodKey,
  patchWorkspacePeriod,
  readWorkspacePeriod,
  workspacePeriodOptions,
  WORKSPACE_PERIOD_ORDER,
  WORKSPACE_PERIOD_LABELS,
  type WorkspacePeriodKey,
  type WorkspacePeriodPrefs,
  type WorkspacePeriodScope,
} from "./lib/hub-workspace-period";
export {
  WORKSPACE_PERIOD_DOT_COLORS,
  workspacePeriodDotColor,
  workspacePeriodTriggerIconColor,
} from "./lib/workspace-period-dot-color";
export { useWorkspacePeriod } from "./hooks/useWorkspacePeriod";
export { useDebouncedValue } from "./hooks/useDebouncedValue";
export { useHubDirectorySelection } from "./hooks/useHubDirectorySelection";
export { HubRowLimitSelect } from "./shell/HubRowLimitSelect";
export { HubTablePageSizeSelect } from "./shell/HubTablePageSizeSelect";
export { HubFilterSelect, type HubFilterSelectOption } from "./shell/HubFilterSelect";
export {
  AppTabHeader,
  type TabHeaderMetaItem,
  type TabHeaderStatItem,
  type TabTitleMenuItem,
} from "./shell/AppTabHeader";
export { HubListChromeHeader, type HubListChromeHeaderProps } from "./shell/HubListChromeHeader";
export { KpiStrip, type KpiStripTone, type KpiTileData } from "./shell/KpiStrip";
export { MiniBarChart, type BarItem } from "./shell/MiniBarChart";
export {
  DirectoryChartBand,
  directoryChartBandNode,
  hasDirectoryCharts,
  type DirectoryChartBandProps,
} from "./shell/DirectoryChartBand";
export { MiniSparkline } from "./shell/MiniSparkline";
export { EntityRankMiniChart, type EntityRankRow } from "./shell/EntityRankMiniChart";
export { MiniDonut, type DonutItem } from "./shell/MiniDonut";
export { MetricBadge, RegistryMetricBadge, type MetricBadgeProps, type MetricBadgeTone } from "./shell/MetricBadge";
export {
  HubUsersStatusLabel,
  HubUsersOnOffLabel,
  type HubUsersStatusLabelProps,
  type HubUsersStatusTone,
} from "./shell/HubUsersStatusLabel";
export { HubDirectoryIconCell, type HubDirectoryIconCellProps } from "./shell/HubDirectoryIconCell";
export {
  HubDirectoryBrandNameCell,
  HUB_DIRECTORY_TABLE_BRAND_ICON_PX,
  type HubDirectoryBrandNameCellProps,
} from "./shell/HubDirectoryBrandNameCell";
export { buildHubBrandFilterOption, type HubBrandFilterIcon } from "./lib/build-hub-brand-filter-option";
export { HubDirectoryToolBadge, type HubDirectoryToolBadgeProps } from "./shell/HubDirectoryToolBadge";
export {
  HubDirectoryMetricBadge,
  type HubDirectoryMetricBadgeProps,
} from "./shell/HubDirectoryMetricBadge";
export {
  HUB_DIRECTORY_METRIC_TIER_THRESHOLDS,
  hubDirectoryMetricTierClass,
  resolveHubDirectoryMetricTier,
  type HubDirectoryMetricTier,
} from "./lib/directory-metric-tier";
export {
  HubDirectoryMetricStrip,
  type HubDirectoryMetricItem,
  type HubDirectoryMetricTone,
} from "./shell/HubDirectoryMetricStrip";
export { HubCopyBadge, type HubCopyBadgeProps, type HubCopyBadgeDisplay, type HubCopyFeedback, hubCopyBadgeDisplayLabel } from "./shell/HubCopyBadge";
export { HubCopyTickWrap, type HubCopyTickWrapProps } from "./shell/HubCopyTickWrap";
export {
  HubInlineCopyControl,
  useHubCopyFlash,
  type HubInlineCopyControlProps,
} from "./shell/HubInlineCopyControl";
export {
  HubTwofaCopyControl,
  type HubTwofaCopyControlProps,
} from "./shell/HubTwofaCopyControl";
export {
  HUB_TWOFA_CODE_BADGE_CLASS,
  HUB_TWOFA_CODE_BADGE_DESIGN_LOCK,
} from "./shell/hub-twofa-code-badge";
export {
  formatHubOrderPriceParts,
  formatHubOrderPricePillLabel,
  type HubOrderPriceCurrency,
  type HubOrderPriceParts,
} from "./lib/format-order-price";
export {
  HubOrderPriceBadge,
  HubOrderPriceText,
  type HubOrderPriceBadgeProps,
  type HubOrderPriceBadgeTone,
} from "./shell/HubOrderPriceBadge";
export {
  HUB_ORDER_PRICE_TEXT_CLASS,
  HUB_ORDER_PRICE_TEXT_DEFAULT_TONE,
  HUB_ORDER_PRICE_BADGE_CLASS,
  HUB_ORDER_PRICE_BADGE_DESIGN_LOCK,
  HUB_ORDER_PRICE_BADGE_DEFAULT_TONE,
  type HubOrderPriceTextTone,
} from "./shell/hub-order-price-badge";
export {
  HubDirectoryCopyText,
  type HubDirectoryCopyTextProps,
} from "./shell/HubDirectoryCopyText";
export { HubDirectoryEllipsisCell, type HubDirectoryEllipsisCellProps } from "./shell/HubDirectoryEllipsisCell";
export {
  DIRECTORY_CELL_TRUNCATE,
  DIRECTORY_CELL_RICH_TOOLTIP_MIN_LEN,
  directoryCellHoverTitle,
  directoryCellNeedsRichTooltip,
} from "./lib/directory-cell-hover";
export {
  copyTextWithExecCommand,
  copyTextWithFallback,
} from "./lib/copy-text-with-fallback";
export { HUB_DIRECTORY_TIMESTAMP_CLASS } from "./lib/hub-directory-timestamp";
export {
  HUB_DIRECTORY_POPOVER_OFFSET_PX,
  hubDirectoryPopoverPosition,
} from "./lib/hub-directory-popover";
export {
  HubToastProvider,
  HubToastContainer,
  HubToastShell,
  useHubToast,
  useHubToastRequired,
  formatCopyToastPreview,
  copyToastLabelFromTitle,
  type HubToast,
  type HubToastIcon,
  type HubToastType,
} from "./toast";
export { CopyMetaChip, MetaChip, HUB_EMAIL_COPY_CHIP_CLASS, type MetaTone } from "./shell/CopyMetaChip";
export { HubResultCount } from "./shell/HubResultCount";
export { HubSearchField, type HubSearchFieldProps } from "./shell/HubSearchField";
export {
  HubSegmentToggle,
  hubSegmentIconSize,
  type HubSegmentToggleOption,
  type HubSegmentToggleProps,
} from "./shell/HubSegmentToggle";
export { DirectorySearchToolbar, type DirectorySearchToolbarProps } from "./shell/DirectorySearchToolbar";
export { HubDirectoryToolbarSlots, type HubDirectoryToolbarSlotsProps } from "./shell/HubDirectoryToolbarSlots";
export { ViewToggle, type HubViewMode } from "./shell/ViewToggle";
export {
  HubTabChrome,
  HubTabBody,
  configureHubChromePrefs,
  useHubChromePrefs,
  type HubChromePrefs,
} from "./shell/HubTabChrome";
export { HubTabSectionRule } from "./shell/HubTabSectionRule";
export { HubAlert } from "./content/HubAlert";
export { HubDriftBanner, type HubDriftBannerAction, type HubDriftBannerProps } from "./content/HubDriftBanner";
export { HubDataTable, HubTableEmptyRow, type HubTableColumn } from "./content/HubDataTable";
export { HubPaginatedDataTable, type HubPaginatedDataTableProps } from "./content/HubPaginatedDataTable";
export { HubReadOnlyDataTable, type HubReadOnlyDataTableProps } from "./content/HubReadOnlyDataTable";
export { HubPaginatedTableShell, type HubPaginatedTableShellProps } from "./content/HubPaginatedTableShell";
export {
  HubPaginatedCardGrid,
  HUB_DIRECTORY_CARD_GRID_CLASS,
  type HubPaginatedCardGridProps,
} from "./content/HubPaginatedCardGrid";
export { HubTablePager, type HubTablePagerProps } from "./content/HubTablePager";
export {
  DirectoryRelativeTimeCell,
  type DirectoryRelativeTimeCellProps,
} from "./content/DirectoryRelativeTimeCell";
export {
  HubDirectoryCompactTimestampLabel,
  HubDirectoryTimestampLabel,
  type HubDirectoryCompactTimestampLabelProps,
} from "./content/HubDirectoryCompactTimestampLabel";
export {
  HubActivityTimestampLabel,
  type HubActivityTimestampLabelProps,
} from "./content/HubActivityTimestampLabel";
export { formatHubRelativeTime } from "./lib/format-hub-relative-time";
export {
  DIRECTORY_EMPTY_LABEL,
  DirectoryEmptyDash,
  HubDirectoryEmptyCell,
  isDirectoryEmptyLabel,
} from "./lib/directory-empty-label";
export {
  formatHubActivityRelativeAge,
  formatHubActivityStaleLabel,
  formatHubActivityTime,
  formatLastOpenedRelativeAge,
  formatLastOpenedStaleDate,
  HUB_ACTIVITY_AGING_MS,
  HUB_ACTIVITY_FRESH_MS,
  HUB_ACTIVITY_RECENT_MS,
  hubActivityAgeHubTone,
  hubActivityAgeTone,
  lastOpenedAgeTone,
  lastOpenedHubTone,
  parseHubActivityMs,
  type HubActivityAgeTone,
} from "./lib/format-hub-activity-time";
export {
  formatHubDirectoryDateCompact,
  formatHubTimestampCompact,
  formatHubTimestampDateOnly,
  formatHubTimestampFull,
} from "./lib/format-hub-timestamp-compact";
export {
  extractNumericSearchTerm,
  matchesDirectoryIdSearch,
  getDirectorySearchHighlight,
  buildHighlightSegments,
  type DirectoryIdSearchInput,
  type DirectoryIdSearchOptions,
  type DirectorySearchHighlight,
  type HighlightSegment,
} from "./lib/directory-id-search";
export { HubDirectorySearchHighlightText } from "./content/HubDirectorySearchHighlightText";

export { useRelativeNow } from "./lib/use-relative-now";
export {
  configureDirectoryPager,
  directoryPagerChangeEvent,
  directoryPagerHideWhenSinglePage,
} from "./table/directory-pager-config";
export { HubTableColumnHeader, type HubTableColumnHeaderProps } from "./content/HubTableColumnHeader";
export {
  HubDirectoryColumnHint,
  type HubDirectoryColumnHintContent,
  type HubDirectoryColumnHintGlyph,
  type HubDirectoryColumnHintLine,
} from "./table/HubDirectoryColumnHint";
export { HubSortIndicator, type HubSortDir } from "./table/HubSortIndicator";
export {
  directoryTableSortReducer,
  useDirectoryTableSort,
} from "./table/useDirectoryTableSort";
export {
  HUB_DIRECTORY_TABLE_SCROLL_CLASS,
  HUB_DIRECTORY_TABLE_INLINE_WRAP_CLASS,
  HUB_DIRECTORY_TABLE_PANE_CHROME_SPLIT_CLASS,
  HUB_DIRECTORY_TABLE_PANE_WRAP_CLASS,
  HUB_DIRECTORY_TABLE_PANE_INLINE_SCROLL_CLASS,
  HUB_DIRECTORY_TABLE_SCROLL_FLEX_CLASS,
} from "./table/directory-table-scroll";
export {
  readHubDirectoryPinnedIds,
  toggleHubDirectoryPinnedId,
  pinHubDirectoryIds,
  sortHubDirectoryPinnedFirst,
  purgeHubDirectoryPinnedStorage,
  type HubDirectoryPinScope,
} from "./prefs/hub-directory-pinned";
export {
  HubDirectoryTableShell,
  type HubDirectoryTableColumn,
  type HubDirectoryTableShellProps,
  type HubDirectoryTableStaticColumn,
} from "./table/HubDirectoryTableShell";
export { DirectorySplitScrollTable } from "./table/DirectorySplitScrollTable";
export { DirectoryInlineTable } from "./table/DirectoryInlineTable";
export {
  DirectoryTableBodyCell,
  type DirectoryTableBodyCellProps,
} from "./table/DirectoryTableBodyCell";
export {
  buildDirectoryColgroup,
  buildDirectoryColgroupForShell,
  buildDirectoryColumns,
  scaleDirectoryColumnWidths,
  validateDirectoryColumns,
  hubDirectoryTableClass,
  hubDirectoryFrameTableClass,
  HUB_DIRECTORY_FRAME_CLASS,
  HUB_DIRECTORY_FRAME_TABLE_CLASS,
  HUB_DIRECTORY_TABLE_BASE_CLASS,
  HUB_DIRECTORY_TABLE_WRAP_CLASS,
  HUB_DIRECTORY_USER_TABLE_WRAP_CLASS,
  HUB_DIRECTORY_SELECT_COL_WIDTH,
  HUB_DIRECTORY_SELECT_COLGROUP_WIDTH,
  HUB_MODAL_DIRECTORY_TABLE_WRAP_CLASS,
  type DirectoryColgroupOptions,
  type DirectoryColgroupForShellOptions,
  type HubDirectoryColumnDef,
  type HubDirectoryColumnKind,
  type HubDirectoryColumnMetaInput,
  type HubDirectoryTableVariant,
  resolveDirectoryPanelFillRows,
} from "./table/hub-directory-table-meta";
export {
  buildDirectoryFixedColumnTabularSelectors,
  generateDirectoryFixedColumnCss,
  verifyDirectoryColumnMetaKeys,
  verifyDirectoryColumnWidths,
  verifyDirectoryFixedColumnCss,
  type DirectoryColumnWidthEntry,
  type DirectoryFixedColumnEntry,
  type GenerateDirectoryFixedColumnCssOptions,
} from "./table/directory-fixed-column-css";
export {
  HUB_DIRECTORY_COLUMN_WIDTH_REGISTRY,
  HUB_DIRECTORY_FIXED_COL_WIDTH_BANDS,
  HUB_DIRECTORY_SELECT_WIDTH_SPEC,
  isFixedDirectoryColumnRole,
  isFixedDirectoryColumnWidth,
  isFluidDirectoryColumnWidth,
  resolveDirectoryColumnWidthSpec,
  validateDirectoryColumnWidthMeta,
  type HubDirectoryColumnWidthKind,
  type HubDirectoryColumnWidthSpec,
} from "./table/hub-directory-column-width-registry";
export {
  HUB_ROUTE_ACCESS_TABLE_CLASS,
  HUB_ROUTE_ACCESS_TABLE_WRAP_CLASS,
  HUB_ROUTE_ACCESS_MODAL_TABLE_CLASS,
  HUB_ROUTE_ACCESS_MODAL_TABLE_WRAP_CLASS,
  HUB_ROUTE_ACCESS_COL,
  HUB_ROUTE_ACCESS_MODAL_COLUMN_DEFS,
  HUB_ROUTE_ACCESS_SKELETON_WRAP_CLASS,
  buildHubRouteAccessModalColumns,
  hubRouteAccessModalColumnCount,
  hubRouteAccessModalTableClass,
  type HubRouteAccessColumnKey,
  type HubRouteAccessColumnLayout,
  type HubRouteAccessModalColumnOptions,
  type HubRouteAccessSortKey,
} from "./table/hub-route-access-table-meta";
export {
  HubRouteAccessDirectoryTable,
  type HubRouteAccessDirectoryTableProps,
} from "./table/HubRouteAccessDirectoryTable";
export {
  hubRouteAccessFilterDefs,
  type HubRouteAccessFilterScope,
} from "./table/hub-route-access-filter-defs";
export {
  HubUserToolsDirectoryTable,
  type HubUserToolsDirectoryTableProps,
} from "./table/HubUserToolsDirectoryTable";
export {
  HubUserToolsDirectoryTableSkeleton,
  type HubUserToolsDirectoryTableSkeletonProps,
} from "./table/HubUserToolsDirectoryTableSkeleton";
export {
  HUB_USER_TOOLS_COL,
  HUB_USER_TOOLS_MODAL_TABLE_CLASS,
  HUB_USER_TOOLS_MODAL_TABLE_WRAP_CLASS,
  HUB_USER_TOOLS_DIRECTORY_TABLE_CLASS,
  HUB_USER_TOOLS_MODAL_COLUMN_DEFS,
  HUB_USER_TOOLS_SKELETON_WRAP_CLASS,
  buildHubUserToolsModalColumns,
  hubUserToolsModalColumnCount,
} from "./table/hub-user-tools-table-meta";
export {
  HubRouteAccessDirectoryTableSkeleton,
  type HubRouteAccessDirectoryTableSkeletonProps,
} from "./table/HubRouteAccessDirectoryTableSkeleton";
export {
  HUB_UI_TEMPLATE_META,
  resolveHubUiTemplateBadge,
  resolveHubUiTemplateMeta,
  type HubUiTemplateMeta,
} from "./table/hub-ui-template-meta";
export {
  HUB_APP_TAB_GROUP_META,
  resolveHubAppTabGroupBadge,
  type HubAppTabGroup,
  type HubAppTabGroupMeta,
} from "./table/hub-app-tab-group-meta";
export { HubUiTemplateBadge, HubAppTabGroupBadge } from "./shell/HubUiTemplateBadge";
export {
  HubSidebarFooterButton,
  HUB_SIDEBAR_FOOTER_BTN_CLASS,
  type HubSidebarFooterButtonProps,
} from "./shell/HubSidebarFooterButton";
export {
  HubSemanticGlyph,
} from "./shell/HubSemanticGlyph";
export {
  HubBrandIcon,
} from "./shell/HubBrandIcon";
export {
  HubTabTitleIcon,
} from "./shell/HubTabTitleIcon";
export type { HubBrandIconProps } from "./shell/HubBrandIcon";
export {
  HubNavIcon,
} from "./shell/HubNavIcon";
export type { HubNavIconProps } from "./shell/HubNavIcon";
export {
  listHubBrandIconIds,
  resolveHubBrandIcon,
  resolveHubBrandIconByMatch,
  clearHubBrandIconMatchCache,
} from "./lib/resolve-hub-brand-icon";
export type { HubBrandIconId, HubBrandIconMeta } from "./lib/resolve-hub-brand-icon";
export {
  HubSidebarNavGroup,
  HubSidebarNavGroupHeader,
  NavGroupSubNav,
} from "./shell/HubSidebarNavGroup";
export {
  HubSystemTabSubNav,
  HUB_SYSTEM_TAB_SUBNAV_CLASS,
} from "./shell/HubSystemTabSubNav";
export type {
  HubSidebarNavGroupHeaderProps,
  HubSidebarNavGroupProps,
  NavGroupSubNavItem,
  NavGroupSubNavProps,
} from "./shell/HubSidebarNavGroup";
export {
  HubSidebarNavList,
} from "./shell/HubSidebarNavList";
export type { HubSidebarNavListProps } from "./shell/HubSidebarNavList";
export {
  HubSidebarNavScreenButton,
} from "./shell/HubSidebarNavScreenButton";
export type { HubSidebarNavScreenButtonProps } from "./shell/HubSidebarNavScreenButton";
export {
  HubSidebarShell,
  HUB_SIDEBAR_SHELL_ASIDE_CLASS,
  HUB_SIDEBAR_SHELL_BRAND_TAGLINE_CLASS,
  HUB_SIDEBAR_SHELL_BRAND_TITLE_CLASS,
  HUB_SIDEBAR_SHELL_FOOTER_CLASS,
  HUB_SIDEBAR_SHELL_NAV_CLASS,
  type HubSidebarShellProps,
} from "./shell/HubSidebarShell";
export {
  HubSidebarBrandIcon,
  HUB_SIDEBAR_BRAND_ICON_CLASS,
  type HubSidebarBrandIconProps,
} from "./shell/HubSidebarBrandIcon";
export {
  hubMainShellClassFromManifest,
  hubMainShellClassName,
  type HubMainShellClassOptions,
  type HubMainShellMode,
  type ToolManifestUiShell,
} from "./shell/hub-main-shell-class";
export { useNavGroupOpenState } from "./shell/useNavGroupOpenState";
export {
  applyFirstVisitNavGroupDefaults,
  HUB_NAV_DENSITY_INIT_SUFFIX,
  type ApplyFirstVisitNavGroupDefaultsOptions,
  type NavGroupDensityContext,
} from "./shell/applyFirstVisitNavGroupDefaults";
export {
  flatMapNavScreenItems,
  isNavGroupActive,
  isNavScreenGroup,
  isNavViewGroup,
  navGroupSubnavOpenKey,
  navScreenGroupSubNavItems,
  navViewGroupSubNavItems,
} from "./shell/nav-sidebar-structure";
export type {
  NavGroupBase,
  NavGroupChildBase,
  NavGroupConfig,
  NavScreenGroupChild,
  NavScreenGroupConfig,
  NavScreenNavItem,
  NavStructureEntry,
  NavViewGroupChild,
  NavViewGroupConfig,
} from "./shell/nav-sidebar-structure";
export {
  NAV_ICON_TONES,
  navActiveBarClass,
  navActiveBgClass,
  navActiveTextClass,
  navBadgeIconClass,
  navBadgeVariantClass,
  navChartColor,
  navDotClass,
  navIconClass,
  navKpiTone,
  navMetaTextClass,
  navRailClass,
  navToneStyle,
  type NavIconTone,
  type NavToneStyle,
} from "./shell/sidebar-nav-tones";
export { HubToolAvatar, type HubToolAvatarProps, type HubToolAvatarSize } from "./shell/HubToolAvatar";
export { HubDesignTemplateEmpty, type HubDesignTemplateEmptyProps } from "./content/HubDesignTemplateEmpty";
export {
  HUB_TABLE_PAGE_SIZE,
  hubPageAllSelected,
  hubPageAllSelectedByPredicate,
  hubDirectoryListResetKey,
  hubTablePaginationResetKey,
  hubTogglePageSelectAll,
  hubTogglePageSelectAllByPredicate,
  paginateHubTableItems,
  useHubTablePagination,
  type HubServerPaginationControl,
  type HubTablePaginationState,
} from "./table/hub-table-pagination";
export {
  HUB_TABLE_PAGE_SIZE_DEFAULT,
  TABLE_PAGE_SIZE_OPTIONS,
  patchHubTablePageSizeValue,
  readHubTablePageSize,
  useHubTablePageSize,
} from "./table/hub-table-page-size";
export {
  HUB_TABLE_COLUMN_META,
  resolveHubTableColumnMeta,
  type HubTableColumnMeta,
  type HubTableColumnRole,
} from "./table/hub-table-column-meta";
export { HubPanel } from "./content/HubPanel";
export { HubRuntimeChannelBadge, type HubRuntimeChannelBadgeProps } from "./shell/HubRuntimeChannelBadge";
export {
  HubRuntimeConsoleTerm,
  HubRuntimeConsoleLine,
  HubRuntimeConsoleDuration,
} from "./content/HubRuntimeConsoleTerm";
export {
  HubRuntimeHistoryList,
  type HubRuntimeHistoryRow,
} from "./content/HubRuntimeHistoryList";
export {
  formatHubRuntimeLogTime,
  hubRuntimeConsoleLineClass,
} from "./lib/hub-runtime-format";
export {
  groupHubRuntimeConsoleLogs,
  formatHubRuntimeConsoleGroupMessage,
  type HubRuntimeConsoleLogLike,
  type HubRuntimeConsoleDisplayRow,
} from "./lib/hub-runtime-group";
export { HubDirectoryCard } from "./content/HubDirectoryCard";
export {
  HubDirectoryCardShell,
  HubDirectoryInteractiveCard,
  HubDirectoryCardCheckbox,
  HubDirectoryCardCornerRail,
  HubDirectoryCardPinButton,
  HUB_DIRECTORY_CARD_SURFACE,
  HUB_DIRECTORY_CARD_SELECTED,
  type HubDirectoryCardShellVariant,
  type HubDirectoryCardShellProps,
  type HubDirectoryInteractiveCardProps,
  type HubDirectoryCardCheckboxProps,
  type HubDirectoryCardPinButtonProps,
} from "./content/HubDirectoryCardShell";
export {
  HubDirectoryCardMetaRow,
  type HubDirectoryCardMetaRowProps,
} from "./content/HubDirectoryCardMetaRow";
export {
  HubDirectoryCardHeader,
  type HubDirectoryCardHeaderProps,
} from "./content/HubDirectoryCardHeader";
export {
  HubDirectoryCardLeadingIcon,
  HUB_DIRECTORY_CARD_ICON_BOX_PX,
  HUB_DIRECTORY_CARD_ICON_GLYPH_PX,
  type HubDirectoryCardLeadingIconProps,
} from "./content/HubDirectoryCardLeadingIcon";
export {
  HubDirectoryCardLeadingTile,
  type HubDirectoryCardLeadingTileProps,
} from "./content/HubDirectoryCardLeadingTile";
export { HubTabScreenBody } from "./content/HubTabScreenBody";
export { HubDirectoryScreen, type HubDirectoryScreenProps } from "./templates/HubDirectoryScreen";
export {
  HubWorkspaceDirectoryScreen,
  type HubWorkspaceDirectoryScreenProps,
} from "./templates/HubWorkspaceDirectoryScreen";
export {
  HubSplitWorkspaceScreen,
  type HubSplitWorkspaceScreenProps,
} from "./templates/HubSplitWorkspaceScreen";
export { HubDashboardScreen, type HubDashboardScreenProps } from "./templates/HubDashboardScreen";
export {
  HUB_UI_TEMPLATES,
  GOLDEN_SOURCES,
  isHubUiTemplate,
  type HubUiTemplate,
  type UiScreenEntry,
} from "./ui-template-types";
export {
  configureFilterIcons,
  mergeFilterIconResolver,
  resolveFilterAllIcon,
  defaultFilterAllIcon,
  semanticFilterAllIcon,
  FILTER_BAR_SEMANTIC_KEY,
  DEFAULT_FILTER_ALL_ICONS,
  resolveFilterOptionIcon,
  type FilterIconMeta,
  type HubGlyphComponent,
  type FilterIconResolver,
} from "./shell/filter-icons";
export { countryCodeForLocale, flagCdnUrl, localeFlagIconSrc } from "./lib/locale-flag";
export {
  AGENT_KIND_SEMANTIC,
  AGENT_SCOPE_SEMANTIC,
  buildSemanticTocIcon,
  configureSemanticIcons,
  normalizeSemanticIconKey,
  resolveSemanticIcon,
  SEMANTIC_ICON_ALIASES,
  semanticFilterMeta,
  semanticHeaderStat,
  semanticKpiIcon,
  semanticDirectoryColumnIcon,
} from "./lib/semantic-icon-registry";
export {
  createDirectoryColumnMetaHelpers,
  type DirectoryColumnHeaderMeta,
} from "./lib/directory-column-meta-helpers";
export {
  applyStandardDirectoryColumnHints,
  applyStandardDirectoryColumnHintsToDefs,
  attachDirectoryColumnHints,
  buildDirectoryColumnHintsFromMeta,
  colHint,
  HUB_ACTIVITY_AGE_HINT_LINES,
  inferDirectoryColumnDescription,
  inferDirectoryColumnHintLines,
  isActivityAgeDirectoryColumn,
  withDirectoryColumnHints,
} from "./lib/directory-column-hint-helpers";
export type {
  DeprecatedSemanticIconKey,
  SemanticIconKey,
  SemanticIconLookupKey,
  SemanticIconMeta,
} from "./types/semantic-icon";
export {
  CHART_LEGEND_SLOT_COUNT,
  CHART_OTHERS_LABEL,
  CHART_TOP_N,
  configureChartLegend,
  prepareChartItems,
  topChartItems,
  withChartLegendIcon,
  type ChartLegendIcon,
  type ChartRow,
} from "./chart-items";
export {
  chartBreakdownFromLabels,
  chartBreakdownFromPicker,
  type ChartBreakdownOptions,
} from "./lib/chart-breakdown";
export { createChartLegendResolver } from "./lib/chart-legend";
export {
  CHART_OTHERS_BAR_COLOR,
  CHART_RANK_COLORS,
  chartRankBarColor,
  DEFAULT_CHART_PALETTE,
  isChartOthersLabel,
} from "./lib/chart-palette";
export { usePageSessionSeconds } from "./hooks/usePageSessionSeconds";
export {
  HUB_SHORTCUT_LEGEND,
  configureHubPageShortcuts,
  getHubActiveScreen,
  registerHubPageShortcuts,
  registerHubSearchClear,
  registerHubSearchFocus,
  registerHubSettingsOpen,
  setHubActiveScreen,
  type HubPageShortcutHandlers,
  type HubShortcutId,
} from "./keyboard/hub-keyboard-shortcuts";
export { useHubPageShortcuts } from "./keyboard/useHubPageShortcuts";
export {
  hubSystemShortcutScope,
  resolveHubActiveScreenId,
  useHubActiveScreenSync,
} from "./keyboard/useHubActiveScreenSync";
export { HubKeyboardHints } from "./keyboard/HubKeyboardHints";
export { HubKeyboardShortcutsPanel } from "./keyboard/HubKeyboardShortcutsPanel";
export { WorkspaceTabHeader, type WorkspaceTabHeaderProps } from "./shell/WorkspaceTabHeader";
export { buildVersionMetaItems } from "./shell/workspace-tab-header-meta";
export { HubModalCloseButton, type HubModalCloseButtonProps } from "./shell/HubModalCloseButton";
export { HubModalFrame, type HubModalFrameProps } from "./shell/HubModalFrame";
export { HubDetailModal, type HubDetailModalProps, type HubDetailModalSize } from "./shell/HubDetailModal";
export {
  HubToolDetailSplitLayout,
  HubToolDetailPanel,
  HubToolDetailRail,
} from "./shell/HubToolDetailSplitLayout";
export {
  HubToolDetailModal,
  HubToolDetailModalPrimaryAction,
  HubToolDetailModalSecondaryAction,
  HubToolDetailModalTocLayout,
  HUB_TOOL_DETAIL_BODY_SCROLL_CLASS,
  HUB_TOOL_DETAIL_SCROLL_CLASS,
  HUB_TOOL_DETAIL_SCROLL_ROOT,
  HUB_TOOL_DETAIL_TITLE_ID,
  type HubToolDetailModalPrimaryActionProps,
  type HubToolDetailModalProps,
  type HubToolDetailModalTocLayoutProps,
} from "./shell/HubToolDetailModal";
export {
  HubConfirmDialog,
  type HubConfirmDialogProps,
  type HubConfirmTone,
} from "./shell/HubConfirmDialog";
export { HubPromptDialog, type HubPromptDialogProps } from "./shell/HubPromptDialog";
export {
  HubToolDetailModalFooterActions,
  type HubToolDetailModalFooterActionsProps,
} from "./shell/HubToolDetailModalFooterActions";
export {
  HUB_ACCOUNT_DETAIL_MODAL_SHELL_CLASS,
  HUB_ADM_FORM_SHELL_CLASS,
  HUB_ADM_FORM_ROW_CODE_LINE_CLASS,
  HUB_ADM_GRID_SLOT_SPACER_CLASS,
  HUB_ADM_GRID_SLOT_SPACER_TAIL_CLASS,
  HUB_ADM_TYPE_MONO_CLASS,
  HUB_ADM_TYPE_NAV_CLASS,
  HUB_ADM_TYPE_CSS_VARS,
  HUB_ADM_GLOW_SUBTLE_CLASS,
  HUB_ADM_GLOW_CSS_VARS,
  HUB_ACCOUNT_DETAIL_MAIN_SCROLL_CLASS,
  HUB_ACCOUNT_DETAIL_MAIN_SCROLL_ROOT,
} from "./shell/hubAccountDetailModal";
export {
  HubAccountDetailModalFrame,
  type HubAccountDetailModalFrameProps,
} from "./shell/HubAccountDetailModalFrame";
export {
  HUB_ACCOUNT_DETAIL_SECTION_META,
  hubAccountDetailSectionIcon,
  hubAccountDetailSectionIconClass,
  type HubAccountDetailSectionKind,
  type HubAccountDetailSectionTone,
} from "./shell/hubAccountDetailSectionIcons";
export { HubAdmSectionLabel } from "./shell/HubAdmSectionLabel";
export { hubAdmSectionHeader, hubAdmSectionBlockClass, type HubAdmSectionKey } from "./shell/hubAdmSectionHeaders";
export {
  HubAdmClickEditField,
  HubAdmClickFilterField,
  HubAdmInlineFieldLabel,
  HubAdmReadonlyField,
  type HubAdmClickEditFieldProps,
  type HubAdmClickEditRenderCtx,
  type HubAdmClickFilterFieldProps,
  type HubAdmReadonlyFieldProps,
} from "./shell/HubAdmClickEditField";
export {
  HubAdmClickDateField,
  type HubAdmClickDateFieldProps,
} from "./shell/HubAdmClickDateField";
export {
  HubFilterDatePicker,
  type HubFilterDatePickerProps,
} from "./shell/HubFilterDatePicker";
export { HubAdmNoteSearchBar, type HubAdmNoteSearchBarProps } from "./shell/HubAdmNoteSearchBar";
export { HubAdmNoteHighlightText } from "./shell/HubAdmNoteHighlightText";
export { HubAdmNoteReadonlyBody, type HubAdmNoteReadonlyBodyProps } from "./shell/HubAdmNoteReadonlyBody";
export { HubAdmNoteEditorField, type HubAdmNoteEditorFieldProps } from "./shell/HubAdmNoteEditorField";
export { HubAdmNoteRail, type HubAdmNoteRailEditorProps, type HubAdmNoteRailProps, type HubAdmNoteRailReadonlyProps } from "./shell/HubAdmNoteRail";
export {
  buildHubAdmNoteMirrorSegments,
  findHubAdmNoteMatchRanges,
  useHubAdmNoteSearch,
  type HubAdmNoteMatchRange,
  type HubAdmNoteMirrorSegment,
} from "./shell/hubAdmNoteSearch";
export { HubFormFieldLabel, type HubFormFieldLabelProps } from "./shell/HubFormFieldLabel";
export { HubOpsFormField, type HubOpsFormFieldProps } from "./shell/HubOpsFormField";
export { HubModalFilterField, type HubModalFilterFieldProps } from "./shell/HubModalFilterField";
export {
  HubToolDetailSection,
  HubToolDetailSections,
  HUB_TOOL_DETAIL_SECTIONS_CLASS,
  HUB_TOOL_DETAIL_FORM_GRID_CLASS,
  HUB_TOOL_DETAIL_FORM_GRID_2_CLASS,
  HUB_TOOL_DETAIL_FORM_GRID_3_CLASS,
  type HubToolDetailSectionProps,
} from "./shell/HubToolDetailSection";
export {
  HubModalDirectorySection,
  HubModalDirectoryEmptyFiltered,
  HUB_MODAL_DIRECTORY_SECTION_CLASS,
  HUB_MODAL_DIRECTORY_EMPTY_FILTERED_CLASS,
  type HubModalDirectorySectionProps,
} from "./shell/HubModalDirectorySection";
export {
  HubSplitDirectoryPane,
  HUB_SPLIT_DIRECTORY_PANE_CLASS,
  type HubSplitDirectoryPaneProps,
  type HubSplitDirectoryPaneVariant,
} from "./shell/HubSplitDirectoryPane";
export {
  HubSplitDirectoryFilterBar,
  type HubSplitDirectoryFilterBarProps,
} from "./shell/HubSplitDirectoryFilterBar";
export { HubRouteAboutSummary, type HubRouteAboutSummaryProps } from "./route-detail/HubRouteAboutSummary";
export {
  HubToolDetailIdentityHeader,
  type HubToolDetailIdentityHeaderProps,
} from "./shell/HubToolDetailIdentityHeader";
export {
  HubTocSectionHighlightProvider,
  HubTocHighlightContent,
  useHubTocNavHighlight,
  useHubTocNavActive,
  useHubTocSectionHighlightOptional,
} from "./shell/HubTocSectionHighlight";
export { scrollToHubTocSection, findHubTocScrollContainer } from "./shell/hub-toc-scroll";
export { resolveActiveTocSection, useHubTocSectionSpy } from "./shell/hub-toc-section-spy";
export { HubTocSectionNav, type HubTocNavItem } from "./shell/HubTocSectionNav";
export {
  HubAddModalTocNav,
  type HubAddModalTabItem,
  type HubAddModalTocNavProps,
} from "./shell/HubAddModalTocNav";
export { HubHintTooltip } from "./shell/HubHintTooltip";
export {
  HubHeaderPanelButton,
  HUB_HEADER_PANEL_BTN_CLASS,
  type HubHeaderPanelButtonProps,
} from "./shell/HubHeaderPanelButton";
export { HubUsageLogPanel, type HubLogEntry, type HubLogQuickAction, type HubUsageLogPanelProps } from "./shell/HubUsageLogPanel";
export {
  HubAppLogProvider,
  useHubAppLog,
  type HubAppLogBoot,
  type HubAppLogEventDetail,
  type HubAppLogProviderProps,
} from "./shell/HubAppLogProvider";
export { HubLogButton, type HubLogButtonProps, type HubLogButtonVariant, type HubLogExtraSection } from "./shell/HubLogButton";
export {
  HubNotifyPanel,
  type HubNotifyAlert,
  type HubNotifyAlertSeverity,
  type HubNotifyPanelProps,
  type HubNotifyQuickAction,
} from "./shell/HubNotifyPanel";
export { HubHeaderOpsPanels, type HubHeaderOpsPanelsProps } from "./shell/HubHeaderOpsPanels";
export { HubNotifyButton, type HubNotifyButtonProps } from "./shell/HubNotifyButton";
export { HubFilterRowButton, type HubFilterRowButtonProps, type HubFilterRowTone } from "./shell/HubFilterRowButton";
export {
  HubBulkActionButton,
  HubBulkActionCountBadge,
  HUB_BULK_ACTION_BTN_CLASS,
  type HubBulkActionButtonProps,
  type HubBulkActionCountBadgeProps,
  type HubBulkActionTone,
} from "./shell/HubBulkActionButton";
export {
  HubChatbotBulkActionDropdown,
  type HubChatbotBulkActionDropdownProps,
  type HubChatbotBulkPersonalityOption,
  type HubChatbotBulkSelection,
} from "./shell/HubChatbotBulkActionDropdown";
export {
  HubCatalogSyncButton,
  HubScreensDirectoryBulkActions,
  HubToolsDirectoryBulkActions,
  HubUsersDirectoryBulkActions,
  type HubCatalogSyncButtonProps,
  type HubScreensDirectoryBulkActionsProps,
  type HubToolsDirectoryBulkActionsProps,
  type HubUsersDirectoryBulkActionsProps,
} from "./shell/HubDirectoryBulkActions";
export {
  HUB_ANALYTICS_CAPTION_TYPO_CLASS,
  HUB_DIRECTORY_BODY_VALUE_TYPO_SSOT,
  HUB_DIRECTORY_HEADER_LABEL_TYPO_SSOT,
  HUB_DIRECTORY_TOOLBAR_TYPO_CLASS,
  HUB_FILTER_DIRECTORY_HEADER_TYPO_SSOT,
  HUB_FILTER_DIRECTORY_VALUE_TYPO_SSOT,
  HUB_SHELL_LABEL_TYPO_CLASS,
  HUB_SIDEBAR_NAV_LABEL_CLASS,
  HUB_SETTINGS_ICON_CLASS,
} from "./shell/hub-typography";
export {
  chartPanelTitleFromDefs,
  chartPanelTitleFromPrefLabel,
  GOLDEN_CHART_PANEL_TITLES,
} from "./lib/chart-panel-titles";
export { HUB_LINK_HEALTH_POLL_MS } from "./lib/hub-directory-timing";
export {
  HubDirectorySelectAllChip,
  type HubDirectorySelectAllChipProps,
} from "./shell/HubDirectorySelectAllChip";
export {
  HubDirectoryToolbarSelection,
  type HubDirectoryToolbarSelectionProps,
} from "./shell/HubDirectoryToolbarSelection";
export {
  HubDirectoryToolAccessBadge,
  type HubDirectoryToolAccessBadgeKind,
  type HubDirectoryToolAccessBadgeProps,
} from "./shell/HubDirectoryToolAccessBadge";
export { hubModalDirectoryFilterSelection } from "./shell/hub-modal-directory-filter-preset";
export {
  buildHubDirectorySelectionSlots,
  shouldShowHubDirectoryResultCount,
  type HubDirectorySelectionSlots,
} from "./shell/hubDirectorySelectionSlots";
export {
  HubDirectoryBulkActionBar,
  type HubDirectoryBulkActionBarProps,
} from "./shell/HubDirectoryBulkActionBar";
export {
  HubDirectoryBulkMoreMenu,
  type HubDirectoryBulkMoreAction,
  type HubDirectoryBulkMoreMenuProps,
} from "./shell/HubDirectoryBulkMoreMenu";
export {
  HubDirectoryBulkActionRail,
  type HubDirectoryBulkActionRailProps,
} from "./shell/HubDirectoryBulkActionRail";
export {
  HubDirectoryCrudBulkActions,
  type HubDirectoryCrudBulkActionsProps,
  type HubDirectoryCrudBulkExtraAction,
} from "./shell/HubDirectoryCrudBulkActions";
export { HubAuthGate, type HubAuthGateProps } from "./auth/HubAuthGate";
export { HubAuthGateOverlay, type HubAuthGateOverlayProps } from "./auth/HubAuthGateOverlay";
export { HubAuthGateModal, type HubAuthGateModalProps } from "./auth/HubAuthGateModal";
export { HubAuthPrompt, type HubAuthPromptProps } from "./auth/HubAuthPrompt";
export { HubAuthLogoutChip, type HubAuthLogoutChipProps } from "./auth/HubAuthLogoutChip";
export {
  HubAuthSessionBadge,
  type HubAuthSessionBadgeProps,
  type HubAuthSessionMode,
} from "./auth/HubAuthSessionBadge";
export { HubAuthGateGoldenPreview } from "./auth/HubAuthGateGoldenPreview";
export { HubAuthGateVariantBadge, type HubAuthGateVariantBadgeProps } from "./auth/HubAuthGateVariantBadge";
export {
  HUB_AUTH_GATE_VARIANTS,
  hubAuthGateVariantBadgeText,
  type HubAuthGateVariant,
  type HubAuthGateVariantMeta,
} from "./auth/hub-auth-gate-variant";
export { formatHubAuthToolInfo, type HubAuthToolInfo } from "./auth/hub-auth-tool-info";
export {
  HubWorkspaceUserModal,
  HUB_WORKSPACE_USER_ACCOUNT_TOC,
  type HubWorkspaceUserModalProps,
  type HubWorkspaceUserProfileRow,
} from "./auth/HubWorkspaceUserModal";
export {
  HubUserModalFieldRow,
  HubUserModalFieldTable,
  type HubUserModalFieldRowProps,
} from "./auth/HubUserModalFieldTable";
export {
  HubFullUserAccountModal,
  HUB_FULL_USER_ACCOUNT_TOC,
  type HubFullUserAccountModalProps,
  type HubFullUserAccountResult,
  type HubFullUserAccountTocId,
} from "./auth/HubFullUserAccountModal";
export { HubUserChangeEmailModal, type HubUserChangeEmailModalProps } from "./auth/HubUserChangeEmailModal";
export {
  HubUserChangePasswordModal,
  type HubUserChangePasswordModalProps,
} from "./auth/HubUserChangePasswordModal";
export {
  HUB_CHANGE_EMAIL_TOC,
  HUB_CHANGE_PASSWORD_TOC,
  hubUserChangeSectionIcon,
  hubUserChangeTocItems,
  type HubUserChangeTocEntry,
} from "./auth/hub-user-change-toc";
export { HubUserFieldActionButton, type HubUserFieldActionButtonProps } from "./auth/HubUserFieldActionButton";
export {
  HUB_WORKSPACE_ROLE_ICON,
  normalizeWorkspaceRoleKey,
  resolveWorkspaceRoleIcon,
  resolveWorkspaceRoleKey,
  workspaceRoleLabel,
  type HubWorkspaceRoleIconMeta,
  type HubWorkspaceRoleKey,
} from "./auth/hub-workspace-role-icon";
export {
  useWorkspaceRoleKey,
  type UseWorkspaceRoleKeyOptions,
  type WorkspaceRoleState,
} from "./auth/useWorkspaceRoleKey";
export {
  cacheWorkspaceProfileRole,
  cacheWorkspaceProfileRoleForUsers,
  clearWorkspaceProfileRoleCache,
  fetchWorkspaceProfileRole,
  readCachedWorkspaceProfileRole,
  subscribeWorkspaceProfileRole,
  subscribeWorkspaceProfileRoleCache,
  warmWorkspaceProfileRole,
  WORKSPACE_PROFILE_ROLE_UPDATED,
  type FetchWorkspaceProfileRoleOptions,
  type WorkspaceProfileRoleUpdatedDetail,
} from "./lib/workspace-profile-role";
export {
  normalizeHubAuthError,
  type NormalizeHubAuthErrorOptions,
} from "./auth/normalize-hub-auth-error";
export {
  WorkspaceAuthGate,
  createWorkspaceAuthGate,
  createWorkspaceAuthGateConfig,
  type CreateWorkspaceAuthGateOptions,
  type WorkspaceAuthGateConfig,
  type WorkspaceAuthGateProps,
} from "./auth/WorkspaceAuthGate";
export {
  createAuthSessionProvider,
  type AuthSessionProviderBundle,
} from "./auth/createAuthSessionProvider";
export {
  HubWorkspaceUserShell,
  type HubWorkspaceUserModalRenderContext,
  type HubWorkspaceUserShellProps,
} from "./auth/HubWorkspaceUserShell";
export { HubAccessDeniedPanel, type HubAccessDeniedPanelProps } from "./auth/HubAccessDeniedPanel";
export { HubAuthBrandIcon, type HubAuthBrandIconProps } from "./auth/HubAuthBrandIcon";
export { HubAuthBootPanel, type HubAuthBootPanelProps } from "./auth/HubAuthBootPanel";
export { HubSidebarUserFooter, type HubSidebarUserFooterProps } from "./auth/HubSidebarUserFooter";
export { HubWorkspaceUserAvatar, type HubWorkspaceUserAvatarProps } from "./auth/HubWorkspaceUserAvatar";
export {
  buildWorkspaceUserProfileRows,
  resolveHubAuthSessionMode,
  workspaceUserFooterLabel,
  workspaceUserInitials,
  type BuildWorkspaceUserProfileRowsOptions,
} from "./auth/workspace-user-session";
