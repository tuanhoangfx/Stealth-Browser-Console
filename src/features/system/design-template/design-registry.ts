/**
 * Active design reviews in System → Design.
 * Design nav/route mounts only while this count is > 0 (SSOT design-preview-5).
 */
export const ACTIVE_DESIGN_COUNT = 0;

/** Locked 2026-11-10 — Run History Design H1 (V1) Audit Trail & Session Summary (Before → After + Duration). */
export const RUN_HISTORY_DESIGN_LOCK = "V1" as const;

/** Locked 2026-11-10 — Runtime Console Log Design L1 Deep Action & Telemetry Stream ([COOKIE] · [PROXY] · [STEP] · [EXT]). */
export const RUNTIME_CONSOLE_LOG_DESIGN_LOCK = "L1" as const;

/** Locked 2026-11-10 — Profile KPI Tooltip Design K1 Grouped by Daemon / Process Pool (Headless & Waiting). */
export const PROFILE_KPI_TOOLTIP_DESIGN_LOCK = "K1" as const;

/**
 * Locked 2026-07-30 — System Console = live RunLogs only (v1.0.154 SSOT).
 * Rule: `.cursor/rules/p0003-runtime-console-ssot.mdc` · test: `runtime-console-ssot.test.ts`
 */
export const RUNTIME_CONSOLE_LOG_SSOT_LOCK = "v1.0.154-live-runlogs" as const;

/** Locked 2026-07-06 — Workflow canvas Design V5 Spaced bezier flow. */
export const WORKFLOW_CANVAS_LAYOUT_DESIGN_LOCK = "V5" as const;

/**
 * Locked 2026-07-21 — Design V4 Digits only.
 * Native Chromium icon + Bold colored last3; 0xxx white, 1–9 vivid (`v4-digits-only-spaced8`).
 */
export const TASKBAR_PROFILE_BADGE_DESIGN_LOCK = "V4" as const;
