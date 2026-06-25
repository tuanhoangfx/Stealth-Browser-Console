import type { LucideIcon } from "lucide-react";
import { KeyRound, LogOut, StickyNote } from "lucide-react";
import type { ReactNode } from "react";
import {
  HubToolDetailModal,
  HubToolDetailModalPrimaryAction,
  HUB_TOOL_DETAIL_SCROLL_ROOT,
} from "../shell/HubToolDetailModal";
import {
  HubToolDetailSection,
  HUB_TOOL_DETAIL_SECTIONS_CLASS,
} from "../shell/HubToolDetailSection";
import { HubTocSectionNav } from "../shell/HubTocSectionNav";
import { HubUserModalFieldRow, HubUserModalFieldTable } from "./HubUserModalFieldTable";
import {
  HUB_WORKSPACE_USER_ACCOUNT_TOC,
  hubUserAccountSectionIcon,
  hubUserAccountTocItems,
} from "./hub-user-account-toc";

export { HUB_WORKSPACE_USER_ACCOUNT_TOC } from "./hub-user-account-toc";

const FIELD_ICON_CLASS: Record<string, string> = {
  Email: "text-sky-300",
  Role: "text-purple-300",
  Provider: "text-amber-300",
  Created: "text-slate-400",
  "Last sign in": "text-emerald-300",
};

export type HubWorkspaceUserProfileRow = {
  label: string;
  value: string;
  icon: LucideIcon;
  iconClassName?: string;
};

export type HubWorkspaceUserModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  headerLeading?: ReactNode;
  userId?: string | null;
  rows: HubWorkspaceUserProfileRow[];
  workspaceNote?: string;
  signingOut?: boolean;
  sessionActive?: boolean;
  /** When false, footer Sign Out is hidden (local console / guest). Default true. */
  showSignOut?: boolean;
  onSignOut: () => void;
  children?: ReactNode;
};

/** Workspace user account modal — Header · TOC · Main · Footer (P0020 / P0016). */
export function HubWorkspaceUserModal({
  open,
  onClose,
  title,
  headerLeading,
  userId,
  rows,
  workspaceNote,
  signingOut = false,
  sessionActive = true,
  showSignOut = true,
  onSignOut,
  children,
}: HubWorkspaceUserModalProps) {
  const tocItems = hubUserAccountTocItems(HUB_WORKSPACE_USER_ACCOUNT_TOC);
  const sectionIds = tocItems.map((item) => item.id);

  return (
    <HubToolDetailModal
      open={open}
      onClose={onClose}
      title={title}
      titleId="hub-workspace-user-modal-title"
      headerLeading={headerLeading}
      shellClassName="hub-header-panel-modal"
      ariaLabelledBy="hub-workspace-user-modal-title"
      sectionIds={sectionIds}
      toc={
        <div className="hub-toc-nav">
          <HubTocSectionNav items={tocItems} scrollRootSelector={HUB_TOOL_DETAIL_SCROLL_ROOT} />
        </div>
      }
      footer={
        showSignOut ? (
          <HubToolDetailModalPrimaryAction
            label={signingOut ? "Signing out…" : "Sign Out"}
            onClick={onSignOut}
            disabled={!sessionActive || signingOut}
            busy={signingOut}
            danger
            icon={LogOut}
          />
        ) : null
      }
    >
      <div className={HUB_TOOL_DETAIL_SECTIONS_CLASS}>
        <HubToolDetailSection
          id="hub-user-account"
          title="Account"
          icon={hubUserAccountSectionIcon(HUB_WORKSPACE_USER_ACCOUNT_TOC, "hub-user-account")}
        >
          <HubUserModalFieldTable>
            {rows.map((row) => (
              <HubUserModalFieldRow
                key={row.label}
                icon={row.icon}
                iconClassName={row.iconClassName ?? FIELD_ICON_CLASS[row.label] ?? "text-indigo-300"}
                label={row.label}
              >
                <span className="truncate font-medium" title={row.value}>
                  {row.value}
                </span>
              </HubUserModalFieldRow>
            ))}
          </HubUserModalFieldTable>
          {children}
        </HubToolDetailSection>
        <HubToolDetailSection
          id="hub-user-session"
          title="Session"
          icon={hubUserAccountSectionIcon(HUB_WORKSPACE_USER_ACCOUNT_TOC, "hub-user-session")}
        >
          <HubUserModalFieldTable>
            <HubUserModalFieldRow icon={KeyRound} iconClassName="text-violet-300" label="User ID">
              {userId ? (
                <span className="font-mono text-[11px] break-all">{userId}</span>
              ) : (
                <span className="text-[var(--muted)]">No active session</span>
              )}
            </HubUserModalFieldRow>
            {workspaceNote ? (
              <HubUserModalFieldRow icon={StickyNote} iconClassName="text-slate-400" label="Note">
                <span className="text-[var(--muted)]">{workspaceNote}</span>
              </HubUserModalFieldRow>
            ) : null}
          </HubUserModalFieldTable>
        </HubToolDetailSection>
      </div>
    </HubToolDetailModal>
  );
}
