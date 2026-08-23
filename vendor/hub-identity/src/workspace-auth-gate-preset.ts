import type { CreateHubForgotPasswordHandlerOptions } from "./hub-forgot-password";

export type WorkspaceAuthToolCode =
  | "P0001"
  | "P0003"
  | "P0004"
  | "P0005"
  | "P0006"
  | "P0012"
  | "P0013"
  | "P0015"
  | "P0016"
  | "P0020"
  | "P0021"
  | "P0022";

export type WorkspaceAuthGateToolInfo = {
  code?: string;
  name: string;
  tagline: string;
};

export type WorkspaceAuthGateErrorPreset = {
  toolHubHint?: boolean;
  dualWorkspace?: boolean;
};

export type WorkspaceAuthGatePreset = {
  title: string;
  toolInfo: WorkspaceAuthGateToolInfo;
  errorOptions?: WorkspaceAuthGateErrorPreset;
  anonymousHint?: string;
  forgotPassword: Partial<
    Pick<
      CreateHubForgotPasswordHandlerOptions,
      "syntheticHint" | "notConfiguredMessage" | "successMessage"
    >
  >;
};

const P0020_ANONYMOUS_HINTS: Record<string, string> = {
  notes: "Browse notes locally. Cloud sync requires sign-in.",
  "cookie-auto": "Use local cookie jar only. Cloud vault sync requires sign-in.",
  twofa: "Limited 2FA access. Full vault requires sign-in.",
  system: "Browse system tools locally. Admin features require sign-in.",
};

/**
 * Title + tagline per tool, in one table.
 *
 * The tagline used to live in a separate ternary chain whose final `else` was P0016's copy, so
 * every tool added here but not there silently shipped "Multi-channel inbox & fanpages" on its
 * login screen. P0012 did exactly that. Keeping both fields in one record makes a missing entry
 * a type error instead of another tool's branding.
 */
/**
 * The only taglines that depend on more than the tool code.
 *
 * Explicit and narrow on purpose: the old resolution chain made every tool's tagline look
 * variant-dependent when only P0004's is.
 */
const VARIANT_TAGLINES: Partial<Record<WorkspaceAuthToolCode, Record<string, string>>> = {
  P0004: { users: "Users, roles & password reset" },
};

const BASE: Record<WorkspaceAuthToolCode, WorkspaceAuthGatePreset> = {
  P0001: {
    title: "Welcome to GPM Console",
    toolInfo: { name: "GPM Console", tagline: "GPM Login automation" },
    forgotPassword: {},
  },
  P0003: {
    title: "Welcome to Stealth Browser Console",
    toolInfo: { name: "Stealth Browser Console", tagline: "" },
    forgotPassword: {},
  },
  P0004: {
    title: "Welcome to Tool Hub",
    toolInfo: { name: "Tool Hub", tagline: "Workspace login for infi tools" },
    forgotPassword: {
      syntheticHint:
        "Link your email in Account after sign-in, or ask an admin to reset your password.",
      successMessage: "Check your inbox for a reset link.",
    },
  },
  P0005: {
    title: "Welcome to CRM",
    toolInfo: { name: "CRM", tagline: "CRM · customers & orders" },
    forgotPassword: {},
  },
  P0006: {
    title: "Welcome to Content Studio",
    toolInfo: { name: "Content Studio", tagline: "Auto reup TikTok · Douyin · YouTube" },
    forgotPassword: {
      syntheticHint:
        "Link your email in Account after sign-in, or ask an admin to reset your password.",
      successMessage: "Check your inbox for a reset link.",
    },
  },
  P0012: {
    title: "Welcome to Performance",
    toolInfo: { name: "Performance", tagline: "Work performance, boards & team workload" },
    errorOptions: { toolHubHint: true, dualWorkspace: true },
    forgotPassword: {},
  },
  P0015: {
    title: "Welcome to ENZY Portal",
    toolInfo: { name: "ENZY Portal", tagline: "Tasks, customers, places & portal access" },
    errorOptions: { toolHubHint: true, dualWorkspace: true },
    forgotPassword: {},
  },
  P0013: {
    title: "Welcome to YouTube Channel Dashboard",
    toolInfo: { name: "YouTube Channel Dashboard", tagline: "Channel analytics & team ops" },
    forgotPassword: {
      syntheticHint:
        "Link your email in Account after sign-in, or ask an admin to reset your password.",
      successMessage: "Check your inbox for a reset link.",
    },
  },
  P0016: {
    title: "Welcome to Chat Center",
    toolInfo: { name: "Chat Center", tagline: "Multi-channel inbox & fanpages" },
    errorOptions: { toolHubHint: true, dualWorkspace: true },
    forgotPassword: {},
  },
  P0020: {
    title: "Welcome to Data Box",
    toolInfo: { name: "Data Box", tagline: "Notes, cookies & 2FA vault" },
    errorOptions: { toolHubHint: true, dualWorkspace: true },
    forgotPassword: {},
  },
  P0021: {
    title: "Welcome to AutoVideo Studio",
    toolInfo: { name: "AutoVideo Studio", tagline: "Local video studio & render jobs" },
    forgotPassword: {},
  },
  P0022: {
    title: "Welcome to Infi Store",
    toolInfo: { name: "Infi Store", tagline: "Store · checkout & order history" },
    errorOptions: { toolHubHint: true, dualWorkspace: true },
    forgotPassword: {},
  },
};

export type CreateWorkspaceAuthGatePresetOptions = {
  code: WorkspaceAuthToolCode;
  /** P0004: hub | users · P0020: notes | cookie-auto | twofa | system */
  variant?: string;
  toolName?: string;
  tagline?: string;
  title?: string;
};

/** Shared login gate preset — merge with tool-specific `onSubmit` + `forgotPassword` handlers. */
export function createWorkspaceAuthGatePreset(
  options: CreateWorkspaceAuthGatePresetOptions,
): WorkspaceAuthGatePreset {
  const base = BASE[options.code];
  const tagline =
    options.tagline ??
    (options.variant ? VARIANT_TAGLINES[options.code]?.[options.variant] : undefined) ??
    base.toolInfo.tagline;

  const anonymousHint =
    options.code === "P0020" && options.variant
      ? P0020_ANONYMOUS_HINTS[options.variant]
      : undefined;

  return {
    title:
      options.title ??
      (options.toolName && options.code === "P0016"
        ? `Welcome to ${options.toolName}`
        : base.title),
    toolInfo: {
      ...base.toolInfo,
      name: options.toolName ?? base.toolInfo.name,
      tagline,
    },
    errorOptions: base.errorOptions,
    anonymousHint,
    forgotPassword: base.forgotPassword,
  };
}
