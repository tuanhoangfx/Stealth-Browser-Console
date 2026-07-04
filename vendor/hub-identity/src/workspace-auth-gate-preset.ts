import type { CreateHubForgotPasswordHandlerOptions } from "./hub-forgot-password";

export type WorkspaceAuthToolCode =
  | "P0001"
  | "P0003"
  | "P0004"
  | "P0005"
  | "P0008"
  | "P0016"
  | "P0020"
  | "P0021";

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

const BASE: Record<
  WorkspaceAuthToolCode,
  Omit<WorkspaceAuthGatePreset, "toolInfo"> & { toolInfo: Omit<WorkspaceAuthGateToolInfo, "tagline"> }
> = {
  P0001: {
    title: "Welcome to GPM Console",
    toolInfo: { name: "GPM Console" },
    forgotPassword: {},
  },
  P0003: {
    title: "Welcome to Stealth Browser Console",
    toolInfo: { name: "Stealth Browser Console" },
    forgotPassword: {},
  },
  P0004: {
    title: "Welcome to Tool Hub",
    toolInfo: { name: "Tool Hub" },
    forgotPassword: {
      syntheticHint:
        "Link your email in Account after sign-in, or ask an admin to reset your password.",
      successMessage: "Check your inbox for a reset link.",
    },
  },
  P0005: {
    title: "Welcome to Order Desk",
    toolInfo: { name: "Order Desk" },
    forgotPassword: {},
  },
  P0008: {
    title: "Welcome to Seller Center",
    toolInfo: { name: "Seller Center" },
    forgotPassword: {},
  },
  P0016: {
    title: "Welcome to Chat Center",
    toolInfo: { name: "Chat Center" },
    errorOptions: { toolHubHint: true, dualWorkspace: true },
    forgotPassword: {},
  },
  P0020: {
    title: "Welcome to Data Box",
    toolInfo: { name: "Data Box" },
    errorOptions: { toolHubHint: true, dualWorkspace: true },
    forgotPassword: {},
  },
  P0021: {
    title: "Welcome to AutoVideo Studio",
    toolInfo: { name: "AutoVideo Studio" },
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
    (options.code === "P0004"
      ? options.variant === "users"
        ? "Users, roles & password reset"
        : "Workspace login for infi tools"
      : options.code === "P0001"
        ? "GPM Login automation"
      : options.code === "P0003"
        ? ""
      : options.code === "P0005"
        ? "Customers & orders"
      : options.code === "P0008"
        ? "CRM · orders & buyer insights"
      : options.code === "P0021"
        ? "Local video studio & render jobs"
      : options.code === "P0020"
        ? "Notes, cookies & 2FA vault"
        : "Multi-channel inbox & fanpages");

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
