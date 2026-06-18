import { useEffect, useMemo, useState, type ReactNode } from "react";
import { KeyRound, LogOut, Mail, RefreshCcw, User } from "lucide-react";
import type { HubSessionLike } from "@tool-workspace/hub-identity";
import { canUseEmailPasswordRecovery, hubSessionLabels } from "@tool-workspace/hub-identity";
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
import type { HubWorkspaceUserProfileRow } from "./HubWorkspaceUserModal";
import { HubUserModalFieldRow, HubUserModalFieldTable } from "./HubUserModalFieldTable";
import { HubUserChangeEmailModal } from "./HubUserChangeEmailModal";
import { HubUserChangePasswordModal } from "./HubUserChangePasswordModal";
import { HubUserFieldActionButton } from "./HubUserFieldActionButton";
import {
  HUB_FULL_USER_ACCOUNT_TOC,
  hubUserAccountSectionIcon,
  hubUserAccountTocItems,
} from "./hub-user-account-toc";
import { resolveWorkspaceRoleIcon, workspaceRoleLabel } from "./hub-workspace-role-icon";

export { HUB_FULL_USER_ACCOUNT_TOC } from "./hub-user-account-toc";
export type HubFullUserAccountTocId = "hub-user-account";

const FIELD_ICON_CLASS: Record<string, string> = {
  "User ID": "text-violet-300",
  Email: "text-sky-300",
  Password: "text-amber-300",
  Role: "text-purple-300",
  Provider: "text-amber-300",
  Created: "text-slate-400",
  "Last sign in": "text-emerald-300",
};

export type HubFullUserAccountResult = { ok: boolean; message: string };

export type HubFullUserAccountModalProps = {
  open: boolean;
  onClose: () => void;
  session: HubSessionLike;
  title?: string;
  headerLeading?: ReactNode;
  headerTrailing?: ReactNode;
  initials: string;
  roleLabel: string;
  rows?: HubWorkspaceUserProfileRow[];
  onResolveRole?: (userId: string) => Promise<string | null>;
  onLinkEmail: (email: string) => Promise<HubFullUserAccountResult>;
  onSendOtp: (email: string) => Promise<HubFullUserAccountResult>;
  onConfirmPassword: (email: string, code: string, password: string) => Promise<HubFullUserAccountResult>;
  onSignOut: () => Promise<HubFullUserAccountResult>;
  onSignOutError?: (title: string, message: string) => void;
};

/** Full account modal — profile + inline change email/password sub-modals (P0004). */
export function HubFullUserAccountModal({
  open,
  onClose,
  session,
  title,
  headerLeading,
  headerTrailing,
  initials,
  roleLabel,
  rows: rowsOverride,
  onResolveRole,
  onLinkEmail,
  onSendOtp,
  onConfirmPassword,
  onSignOut,
  onSignOutError,
}: HubFullUserAccountModalProps) {
  const [signingOut, setSigningOut] = useState(false);
  const [resolvedRole, setResolvedRole] = useState<string | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  const user = session?.user ?? null;
  const labels = hubSessionLabels(session);
  const provider = String(user?.app_metadata?.provider ?? "email");
  const createdAt = user?.created_at ? new Date(user.created_at).toLocaleString("vi-VN") : "—";
  const lastSignIn = user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString("vi-VN") : "—";
  const displayName = title ?? labels.loginId ?? labels.email ?? user?.id?.slice(0, 8) ?? "User";

  const emailDisplay =
    labels.email || (labels.hasSyntheticAuth ? "Not linked" : labels.authEmail) || "—";

  const recoveryEmail = useMemo(() => {
    if (labels.email) return labels.email;
    if (canUseEmailPasswordRecovery(labels.authEmail)) return labels.authEmail;
    return "";
  }, [labels.authEmail, labels.email]);

  const canRecover = Boolean(recoveryEmail);

  const tocItems = useMemo(() => hubUserAccountTocItems(HUB_FULL_USER_ACCOUNT_TOC), []);
  const sectionIds = useMemo(() => tocItems.map((item) => item.id), [tocItems]);

  const defaultRows: HubWorkspaceUserProfileRow[] = useMemo(() => {
    const roleValue = resolvedRole ?? roleLabel;
    const roleMeta = resolveWorkspaceRoleIcon(roleValue);
    return [
      { label: "User ID", value: labels.loginId || "—", icon: User },
      { label: "Email", value: emailDisplay, icon: Mail },
      { label: "Password", value: session ? "••••••••" : "—", icon: KeyRound },
      {
        label: "Role",
        value: resolvedRole ? workspaceRoleLabel(resolvedRole) : roleLabel,
        icon: roleMeta.icon,
        iconClassName: roleMeta.className,
      },
      { label: "Provider", value: provider, icon: KeyRound },
      { label: "Created", value: createdAt, icon: User },
      { label: "Last sign in", value: lastSignIn, icon: RefreshCcw },
    ];
  }, [
    labels.loginId,
    emailDisplay,
    session,
    resolvedRole,
    roleLabel,
    provider,
    createdAt,
    lastSignIn,
  ]);

  const rows = rowsOverride ?? defaultRows;

  useEffect(() => {
    if (!open || !user?.id || !onResolveRole) {
      setResolvedRole(null);
      return;
    }
    let cancelled = false;
    void onResolveRole(user.id).then((r) => {
      if (!cancelled && r) setResolvedRole(r);
    });
    return () => {
      cancelled = true;
    };
  }, [open, user?.id, onResolveRole]);

  useEffect(() => {
    if (!open) {
      setEmailModalOpen(false);
      setPasswordModalOpen(false);
    }
  }, [open]);

  const handleSignOut = () => {
    void (async () => {
      setSigningOut(true);
      const result = await onSignOut();
      setSigningOut(false);
      if (!result.ok) {
        onSignOutError?.("Sign out failed", result.message);
        return;
      }
      onClose();
    })();
  };

  const renderFieldValue = (row: HubWorkspaceUserProfileRow) => {
    if (row.label === "Email" && session) {
      return (
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="truncate font-medium" title={row.value}>
            {row.value}
          </span>
          <HubUserFieldActionButton label="Change email" onClick={() => setEmailModalOpen(true)} />
        </div>
      );
    }
    if (row.label === "Password" && session) {
      return (
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="font-medium tabular-nums tracking-widest text-[var(--muted)]">{row.value}</span>
          <HubUserFieldActionButton
            label="Change password"
            onClick={() => setPasswordModalOpen(true)}
            disabled={!canRecover}
          />
        </div>
      );
    }
    return (
      <span className="truncate font-medium" title={row.value}>
        {row.value}
      </span>
    );
  };

  return (
    <>
      <HubToolDetailModal
        open={open}
        onClose={onClose}
        title={displayName}
        titleId="hub-user-modal-title"
        headerLeading={
          headerLeading ?? (
            <span
              className="user-access-modal__avatar grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-indigo-300/25 bg-indigo-500/20 text-xs font-bold text-indigo-100"
              aria-hidden
            >
              {initials}
            </span>
          )
        }
        headerTrailing={
          headerTrailing ?? (
            <span className="truncate font-mono text-[10px] text-[var(--muted)]">
              {labels.loginId ? `ID: ${labels.loginId}` : user?.id?.slice(0, 8) ?? "—"}
            </span>
          )
        }
        shellClassName="hub-header-panel-modal"
        sectionIds={sectionIds}
        toc={
          <div className="hub-toc-nav">
            <HubTocSectionNav items={tocItems} scrollRootSelector={HUB_TOOL_DETAIL_SCROLL_ROOT} />
          </div>
        }
        footer={
          <HubToolDetailModalPrimaryAction
            label={signingOut ? "Signing out…" : "Sign Out"}
            onClick={handleSignOut}
            disabled={!session || signingOut}
            busy={signingOut}
            danger
            icon={LogOut}
          />
        }
        ariaLabelledBy="hub-user-modal-title"
      >
        <div className={HUB_TOOL_DETAIL_SECTIONS_CLASS}>
          <HubToolDetailSection
            id="hub-user-account"
            title="Account"
            icon={hubUserAccountSectionIcon(HUB_FULL_USER_ACCOUNT_TOC, "hub-user-account")}
          >
            <HubUserModalFieldTable>
              {rows.map((row) => (
                <HubUserModalFieldRow
                  key={row.label}
                  icon={row.icon}
                  iconClassName={row.iconClassName ?? FIELD_ICON_CLASS[row.label] ?? "text-indigo-300"}
                  label={row.label}
                >
                  {renderFieldValue(row)}
                </HubUserModalFieldRow>
              ))}
            </HubUserModalFieldTable>
          </HubToolDetailSection>
        </div>
      </HubToolDetailModal>

      <HubUserChangeEmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        initialEmail={labels.email || recoveryEmail}
        hasLinkedEmail={Boolean(labels.email)}
        onSubmit={onLinkEmail}
      />
      <HubUserChangePasswordModal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        recoveryEmail={recoveryEmail}
        canRecover={canRecover}
        onSendOtp={onSendOtp}
        onConfirmPassword={onConfirmPassword}
      />
    </>
  );
}
