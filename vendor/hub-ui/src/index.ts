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
  type PrefIconMap,
  type PrefIconMeta,
} from "./display-prefs/pref-item-icons";
export {
  countHiddenDirectoryTableColumns,
  createDirectoryTableColumnPrefs,
  type DirectoryTableColumnItem,
  type DirectoryTableColumnPrefs,
} from "./prefs/directory-table-column-prefs";
export {
  DirectoryTableColumnsSettings,
  type DirectoryTableColumnsSettingsProps,
} from "./prefs/DirectoryTableColumnsSettings";
export { DirectoryTableColumnsResetAction } from "./prefs/DirectoryTableColumnsResetAction";
export { compactIconSize, HUB_CHROME_ICON_PX, HUB_COMPACT_SCALE } from "./ui-scale";
export { deployLabel } from "./lib/deploy-label";
export { formatTabHeaderTimestamp } from "./lib/tab-header-timestamp";
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
  HUB_FILTER_DROPDOWN_PANEL_CLASS,
  HUB_FILTER_DROPDOWN_PANEL_PORTAL_CLASS,
  HUB_FILTER_DROPDOWN_ROW_CLASS,
  HubFilterDropdownCircle,
  HubFilterDropdownPanelSearch,
  HubFilterDropdownTrigger,
  HUB_FILTER_OPTION_EMOJI_CLASS,
  HUB_FILTER_BRAND_ICON_CLASS,
  hubBrandIconImgClass,
  type HubBrandIconShell,
  filterDropdownPanelSearchPlaceholder,
  folderFilterButtonLabel,
  multiFilterTriggerTitle,
  hubFilterTriggerClass,
} from "./shell/filter-dropdown-primitives";
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
  WORKSPACE_PERIOD_LABELS,
  type WorkspacePeriodKey,
  type WorkspacePeriodPrefs,
  type WorkspacePeriodScope,
} from "./lib/hub-workspace-period";
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
export { HubDirectoryToolBadge, type HubDirectoryToolBadgeProps } from "./shell/HubDirectoryToolBadge";
export {
  HubDirectoryMetricBadge,
  HubDirectoryMetricStrip,
  type HubDirectoryMetricItem,
  type HubDirectoryMetricTone,
} from "./shell/HubDirectoryMetricStrip";
export { HubCopyBadge, type HubCopyBadgeProps } from "./shell/HubCopyBadge";
export { HubCopyTickWrap, type HubCopyTickWrapProps } from "./shell/HubCopyTickWrap";
export {
  HubInlineCopyControl,
  useHubCopyFlash,
  type HubInlineCopyControlProps,
} from "./shell/HubInlineCopyControl";
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
  HubActivityTimestampLabel,
  type HubActivityTimestampLabelProps,
} from "./content/HubActivityTimestampLabel";
export { formatHubRelativeTime } from "./lib/format-hub-relative-time";
export {
  formatHubActivityRelativeAge,
  formatHubActivityStaleLabel,
  formatHubActivityTime,
  formatLastOpenedRelativeAge,
  formatLastOpenedStaleDate,
  hubActivityAgeHubTone,
  hubActivityAgeTone,
  lastOpenedAgeTone,
  lastOpenedHubTone,
  parseHubActivityMs,
  type HubActivityAgeTone,
} from "./lib/format-hub-activity-time";
export {
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
export { HubSortIndicator, type HubSortDir } from "./table/HubSortIndicator";
export {
  directoryTableSortReducer,
  useDirectoryTableSort,
} from "./table/useDirectoryTableSort";
export {
  HUB_DIRECTORY_TABLE_SCROLL_CLASS,
  HUB_DIRECTORY_TABLE_INLINE_WRAP_CLASS,
  HUB_DIRECTORY_TABLE_PANE_CHROME_SPLIT_CLASS,
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
  type HubDirectoryColumnMetaInput,
  type HubDirectoryTableVariant,
  resolveDirectoryPanelFillRows,
} from "./table/hub-directory-table-meta";
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
  HubSidebarNavGroup,
  HubSidebarNavGroupHeader,
  NavGroupSubNav,
} from "./shell/HubSidebarNavGroup";
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
export { useNavGroupOpenState } from "./shell/useNavGroupOpenState";
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
  HubToolDetailModalFooterActions,
  type HubToolDetailModalFooterActionsProps,
} from "./shell/HubToolDetailModalFooterActions";
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
  HUB_DIRECTORY_TOOLBAR_TYPO_CLASS,
  HUB_SHELL_LABEL_TYPO_CLASS,
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
  buildHubDirectorySelectionSlots,
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
