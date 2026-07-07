export type HubMainShellMode = "directory" | "split";

export type HubMainShellClassOptions = {
  screen: string;
  /** When omitted, uses `splitScreens` membership. */
  mode?: HubMainShellMode;
  /** Screens that use overflow-hidden split layout (inbox, notes, automation, …). */
  splitScreens?: readonly string[];
  extraClassName?: string;
};

/** Golden hub-main class — directory scroll vs split overflow-hidden (P0016 / P0020). */
export function hubMainShellClassName({
  screen,
  mode,
  splitScreens = [],
  extraClassName = "",
}: HubMainShellClassOptions): string {
  const isSplit = mode === "split" || (mode !== "directory" && splitScreens.includes(screen));
  const screenClass = `hub-main hub-main--${screen}`;
  const extra = extraClassName ? ` ${extraClassName.trim()}` : "";

  if (isSplit) {
    return `${screenClass} flex min-h-0 flex-1 flex-col min-w-0 overflow-hidden${extra}`;
  }

  return `${screenClass} flex-1 min-h-0 min-w-0 hub-scrollbar overflow-y-auto overflow-x-hidden${extra}`;
}

export type ToolManifestUiShell = {
  golden?: string;
  mainMode?: HubMainShellMode;
  splitScreens?: string[];
  userFooter?: "workspace" | "hub-admin";
};

/** Build hub-main class from tool.manifest `uiShell` block. */
export function hubMainShellClassFromManifest(
  screen: string,
  uiShell?: ToolManifestUiShell | null,
  extraClassName?: string,
): string {
  return hubMainShellClassName({
    screen,
    mode: uiShell?.mainMode,
    splitScreens: uiShell?.splitScreens ?? [],
    extraClassName,
  });
}
