import type { ReactNode } from "react";

export const HUB_SIDEBAR_SHELL_ASIDE_CLASS =
  "flex h-full min-h-0 w-60 shrink-0 flex-col overflow-visible border-r border-white/5 bg-[var(--panel)] p-4";

export const HUB_SIDEBAR_SHELL_BRAND_TITLE_CLASS =
  "truncate text-sm font-semibold leading-tight";

/** @deprecated Sidebar brand is logo + title only — do not use for new UI. */
export const HUB_SIDEBAR_SHELL_BRAND_TAGLINE_CLASS = "text-[10px] text-[var(--muted)]";

export const HUB_SIDEBAR_SHELL_NAV_CLASS = "min-h-0 flex-1 space-y-0.5 overflow-y-auto";

export const HUB_SIDEBAR_SHELL_FOOTER_CLASS =
  "mt-2 shrink-0 space-y-0.5 overflow-visible border-t border-white/5 pt-2.5";

export type HubSidebarShellProps = {
  /** Tool avatar or product mark — left of title block. */
  brandLeading: ReactNode;
  brandTitle: string;
  /** @deprecated Do not pass — descriptor/version live in `AppTabHeader` meta. Parity gate forbids `brandTagline=`. */
  brandTagline?: string;
  /** Optional pill/chip beside brand (e.g. Local mode when Hub auth off). */
  brandTrailing?: ReactNode;
  nav: ReactNode;
  footer: ReactNode;
  asideClassName?: string;
};

/** Golden app sidebar chrome — P0004 / P0016 / P0020 shared aside layout. */
export function HubSidebarShell({
  brandLeading,
  brandTitle,
  brandTrailing,
  nav,
  footer,
  asideClassName,
}: HubSidebarShellProps) {
  return (
    <aside className={asideClassName ?? HUB_SIDEBAR_SHELL_ASIDE_CLASS}>
      <div className="mb-4 flex shrink-0 items-center gap-3">
        {brandLeading}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <div className={`min-w-0 flex-1 ${HUB_SIDEBAR_SHELL_BRAND_TITLE_CLASS}`}>{brandTitle}</div>
            {brandTrailing}
          </div>
        </div>
      </div>

      <nav className={HUB_SIDEBAR_SHELL_NAV_CLASS}>{nav}</nav>

      <footer className={HUB_SIDEBAR_SHELL_FOOTER_CLASS}>{footer}</footer>
    </aside>
  );
}
