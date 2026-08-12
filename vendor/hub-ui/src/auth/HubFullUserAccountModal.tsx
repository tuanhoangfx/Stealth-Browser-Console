import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { KeyRound, LogOut, Mail, RefreshCcw, User, UserRound } from "lucide-react";
import type { HubSessionLike } from "@tool-workspace/hub-identity";
import { canUseEmailPasswordRecovery, hubSessionLabels } from "@tool-workspace/hub-identity";
import { HubChangeLogList } from "../content/HubChangeLogList";
import type { HubEntityLogEntry, HubEntityLogFieldMeta } from "../lib/hub-entity-log";
import {
  HubToolDetailModal,
  HubToolDetailModalPrimaryAction,
} from "../shell/HubToolDetailModal";
import { HubAccountDetailAdmScaffold } from "../shell/HubAccountDetailAdmScaffold";
import { HubAccountDetailHeaderSearch } from "../shell/HubAccountDetailHeaderSearch";
import { HubAccountDetailSearchProvider } from "../shell/hubAccountDetailSearch";
import { HubToolDetailRail } from "../shell/HubToolDetailSplitLayout";
import { HubTocSectionNav } from "../shell/HubTocSectionNav";
import {
  HUB_ACCOUNT_DETAIL_MAIN_SCROLL_ROOT,
  HUB_ADM_ACTIVITY_LOG_EMPTY_MESSAGE,
  hubAccountDetailShellClass,
} from "../shell/hubAccountDetailModal";
import {
  hubAccountDetailSectionIcon,
  hubAccountDetailSectionIconClass,
} from "../shell/hubAccountDetailSectionIcons";
import type { HubWorkspaceUserProfileRow } from "./HubWorkspaceUserModal";
import { HubUserModalFieldRow, HubUserModalFieldTable } from "./HubUserModalFieldTable";
import { HubUserChangeEmailModal } from "./HubUserChangeEmailModal";
import { HubUserChangePasswordModal } from "./HubUserChangePasswordModal";
import { HubUserChangeUsernameModal } from "./HubUserChangeUsernameModal";
import { HubUserFieldActionButton } from "./HubUserFieldActionButton";
import {
  HUB_FULL_USER_ACCOUNT_TOC,
  hubUserAccountTocItems,
} from "./hub-user-account-toc";
import { resolveWorkspaceRoleIcon, workspaceRoleLabel } from "./hub-workspace-role-icon";

export { HUB_FULL_USER_ACCOUNT_TOC } from "./hub-user-account-toc";
export type HubFullUserAccountTocId = "hub-user-account" | "hub-user-log";

const FIELD_ICON_CLASS: Record<string, string> = {
  Username: "text-violet-300",
  "User ID": "text-violet-300",
  Email: "text-sky-300",
  Password: "text-amber-300",
  Role: "text-purple-300",
  Provider: "text-amber-300",
  Created: "text-slate-400",
  "Last sign in": "text-emerald-300",
};

const ACCOUNT_LOG_FIELD_META: Record<string, HubEntityLogFieldMeta> = {
  username: { label: "Username", emoji: "👤" },
  email: { label: "Email", emoji: "✉️" },
  password: { label: "Password", emoji: "🔑" },
  session: { label: "Session", emoji: "🟢" },
};

function accountLogFieldMeta(field: string): HubEntityLogFieldMeta {
  return ACCOUNT_LOG_FIELD_META[field] ?? { label: field };
}

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
  /** Update profiles.login_id / User ID (Design V1). */
  onUpdateUsername?: (username: string) => Promise<HubFullUserAccountResult>;
  onSignOut: () => Promise<HubFullUserAccountResult>;
  onSignOutError?: (title: string, message: string) => void;
};

function pushAccountLog(
  setLogs: Dispatch<SetStateAction<HubEntityLogEntry[]>>,
  entry: HubEntityLogEntry,
) {
  setLogs((prev) => [entry, ...prev].slice(0, 40));
}

/** Full account modal — Layout 3 (TOC · Main · Log) SSOT with P0020 Service Log rail. */
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
  onUpdateUsername,
  onSignOut,
  onSignOutError,
}: HubFullUserAccountModalProps) {
  const [signingOut, setSigningOut] = useState(false);
  const [resolvedRole, setResolvedRole] = useState<string | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [usernameModalOpen, setUsernameModalOpen] = useState(false);
  const [activityLog, setActivityLog] = useState<HubEntityLogEntry[]>([]);
  const [usernameOverride, setUsernameOverride] = useState<string | null>(null);
  const [emailOverride, setEmailOverride] = useState<string | null>(null);

  const user = session?.user ?? null;
  const labels = hubSessionLabels(session);
  const provider = String(user?.app_metadata?.provider ?? "email");
  const createdAt = user?.created_at ? new Date(user.created_at).toLocaleString("vi-VN") : "—";
  const lastSignIn = user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString("vi-VN") : "—";
  const loginDisplay = (usernameOverride ?? labels.loginId) || "—";
  const displayName =
    title ??
    (loginDisplay !== "—" ? loginDisplay : labels.email) ??
    user?.id?.slice(0, 8) ??
    "User";

  const emailDisplay =
    emailOverride ||
    labels.email ||
    (labels.hasSyntheticAuth ? "Not linked" : labels.authEmail) ||
    "—";

  const recoveryEmail = useMemo(() => {
    if (emailOverride) return emailOverride;
    if (labels.email) return labels.email;
    if (canUseEmailPasswordRecovery(labels.authEmail)) return labels.authEmail;
    return "";
  }, [emailOverride, labels.authEmail, labels.email]);

  const canRecover = Boolean(recoveryEmail);
  const canEditUsername = Boolean(onUpdateUsername && session);

  const tocItems = useMemo(() => hubUserAccountTocItems(HUB_FULL_USER_ACCOUNT_TOC), []);
  const sectionIds = useMemo(() => tocItems.map((item) => item.id), [tocItems]);

  const defaultRows: HubWorkspaceUserProfileRow[] = useMemo(() => {
    const roleValue = resolvedRole ?? roleLabel;
    const roleMeta = resolveWorkspaceRoleIcon(roleValue);
    return [
      { label: "Username", value: loginDisplay, icon: UserRound },
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
    loginDisplay,
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
      setUsernameModalOpen(false);
      setActivityLog([]);
      setUsernameOverride(null);
      setEmailOverride(null);
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

  const wrapLinkEmail = async (email: string) => {
    const before = emailDisplay;
    const result = await onLinkEmail(email);
    if (result.ok) {
      setEmailOverride(email);
      pushAccountLog(setActivityLog, {
        at: new Date().toISOString(),
        message: `Email: ${before} → ${email}`,
        changes: [{ field: "email", before, after: email }],
      });
    }
    return result;
  };

  const wrapConfirmPassword = async (email: string, code: string, password: string) => {
    const result = await onConfirmPassword(email, code, password);
    if (result.ok) {
      pushAccountLog(setActivityLog, {
        at: new Date().toISOString(),
        message: "Password changed",
        changes: [{ field: "password", before: "••••••••", after: "••••••••" }],
      });
    }
    return result;
  };

  const wrapUpdateUsername = async (username: string) => {
    if (!onUpdateUsername) return { ok: false, message: "Username update is not available." };
    const before = loginDisplay;
    const result = await onUpdateUsername(username);
    if (result.ok) {
      setUsernameOverride(username);
      pushAccountLog(setActivityLog, {
        at: new Date().toISOString(),
        message: `Username: ${before} → ${username}`,
        changes: [{ field: "username", before, after: username }],
      });
    }
    return result;
  };

  const renderFieldValue = (row: HubWorkspaceUserProfileRow) => {
    if (row.label === "Username" && canEditUsername) {
      return (
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="truncate font-medium" title={row.value}>
            {row.value}
          </span>
          <HubUserFieldActionButton label="Change username" onClick={() => setUsernameModalOpen(true)} />
        </div>
      );
    }
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

  const avatarNode = headerLeading ?? (
    <span
      className="user-access-modal__avatar grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-indigo-300/30 bg-indigo-500/25 text-sm font-bold text-indigo-50"
      aria-hidden
      title="Avatar"
    >
      {initials}
    </span>
  );

  return (
    <>
      <HubAccountDetailSearchProvider>
        <HubToolDetailModal
          open={open}
          onClose={onClose}
          title={displayName}
          titleId="hub-user-modal-title"
          headerLeading={avatarNode}
          headerTrailing={
            headerTrailing ?? (
              <span className="truncate font-mono text-[10px] text-[var(--muted)]">
                {loginDisplay !== "—" ? loginDisplay : user?.id?.slice(0, 8) ?? "—"}
              </span>
            )
          }
          headerCenter={<HubAccountDetailHeaderSearch />}
          shellClassName={hubAccountDetailShellClass()}
          scrollRootSelector={HUB_ACCOUNT_DETAIL_MAIN_SCROLL_ROOT}
          sectionIds={sectionIds}
          toc={
            <div className="hub-toc-nav">
              <HubTocSectionNav items={tocItems} scrollRootSelector={HUB_ACCOUNT_DETAIL_MAIN_SCROLL_ROOT} />
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
          <HubAccountDetailAdmScaffold
            panelId="hub-user-account"
            panelTitle="Account"
            panelSectionKey="credentials"
            panelTitleEmoji={undefined}
            main={
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
            }
            rail={
              <HubToolDetailRail
                id="hub-user-log"
                title="Log"
                icon={hubAccountDetailSectionIcon("log")}
                iconClassName={hubAccountDetailSectionIconClass("log")}
                className="twofa-adm-rail--log hub-adm-rail--log"
                ariaLabel="Log"
              >
                <HubChangeLogList
                  entries={activityLog}
                  fieldMeta={accountLogFieldMeta}
                  emptyLabel={HUB_ADM_ACTIVITY_LOG_EMPTY_MESSAGE}
                />
              </HubToolDetailRail>
            }
          />
        </HubToolDetailModal>
      </HubAccountDetailSearchProvider>

      <HubUserChangeUsernameModal
        open={usernameModalOpen}
        onClose={() => setUsernameModalOpen(false)}
        initialUsername={loginDisplay !== "—" ? loginDisplay : ""}
        onSubmit={wrapUpdateUsername}
      />
      <HubUserChangeEmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        initialEmail={labels.email || recoveryEmail}
        hasLinkedEmail={Boolean(labels.email || emailOverride)}
        onSubmit={wrapLinkEmail}
      />
      <HubUserChangePasswordModal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        recoveryEmail={recoveryEmail}
        canRecover={canRecover}
        onSendOtp={onSendOtp}
        onConfirmPassword={wrapConfirmPassword}
      />
    </>
  );
}
