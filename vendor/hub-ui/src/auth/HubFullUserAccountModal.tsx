import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Fingerprint,
  KeyRound,
  LogOut,
  Mail,
  MessageSquare,
  Phone,
  Clock,
  Save,
  User,
  UserRound,
} from "lucide-react";
import type {
  HubOwnProfileFields,
  HubOwnProfilePatch,
  HubSessionLike,
} from "@tool-workspace/hub-identity";
import { hubSessionLabels } from "@tool-workspace/hub-identity";
import { HubChangeLogList } from "../content/HubChangeLogList";
import {
  appendHubEntityLogEntry,
  mergeHubEntityAuditLogs,
  pushHubEntityLogChange,
  type HubEntityLogChange,
  type HubEntityLogEntry,
  type HubEntityLogFieldMeta,
} from "../lib/hub-entity-log";
import { HubContactOpenAction } from "../shell/HubContactOpenAction";
import { hubZaloValueFromPhone } from "../lib/hub-zalo-from-phone";
import { readUserAccountLog, writeUserAccountLog } from "./hub-user-account-log-persist";
import { HubToolDetailModal, HubToolDetailModalPrimaryAction } from "../shell/HubToolDetailModal";
import { HubToolDetailModalAccountFooter } from "../shell/HubToolDetailModalAccountFooter";
import { HubAdmClickEditField, HubAdmReadonlyField } from "../shell/HubAdmClickEditField";
import { HubAdmNoteRail } from "../shell/HubAdmNoteRail";
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
import type { HubBrandIconId } from "../lib/resolve-hub-brand-icon";
import type { HubWorkspaceUserProfileRow } from "./HubWorkspaceUserModal";
import { HubUserAccountSections, hubUserAccountVisibleSectionIds } from "./HubUserAccountSections";
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
  "Display name": "text-sky-300",
  Phone: "text-emerald-300",
  Zalo: "text-sky-300",
  Tele: "text-cyan-300",
  Meta: "text-blue-300",
  Role: "text-purple-300",
  Created: "text-slate-400",
  "Last active": "text-emerald-300",
  "Vault ID": "text-violet-300",
};

const ACCOUNT_LOG_FIELD_META: Record<string, HubEntityLogFieldMeta> = {
  username: { label: "Username", emoji: "👤" },
  email: { label: "Email", emoji: "✉️" },
  password: { label: "Password", emoji: "🔑" },
  fullName: { label: "Display name", emoji: "📛" },
  phone: { label: "Phone", emoji: "📱" },
  zalo: { label: "Zalo", emoji: "💬" },
  telegram: { label: "Tele", emoji: "✈️" },
  meta: { label: "Meta", emoji: "🔵" },
  note: { label: "Note", emoji: "📝" },
  session: { label: "Session", emoji: "🟢" },
};

const EMPTY_OWN_PROFILE: HubOwnProfileFields = {
  fullName: "",
  phone: "",
  zalo: "",
  telegram: "",
  meta: "",
  notes: "",
};

const CHANNEL_BRAND: Record<"Zalo" | "Tele" | "Meta", HubBrandIconId> = {
  Zalo: "zalo",
  Tele: "telegram",
  Meta: "facebook",
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
  /** Direct password update while signed in — no OTP / email confirm. */
  onUpdatePassword: (password: string) => Promise<HubFullUserAccountResult>;
  /** Update profiles.login_id / User ID (Design V1). */
  onUpdateUsername?: (username: string) => Promise<HubFullUserAccountResult>;
  /** Load self-edit profile fields (Display name · Phone · Zalo · Tele · Meta · Note). */
  onLoadOwnProfile?: (userId: string) => Promise<HubOwnProfileFields | null>;
  /** Persist self-edit profile fields — never mutates credentials or role. */
  onUpdateOwnProfile?: (patch: HubOwnProfilePatch) => Promise<HubFullUserAccountResult>;
  onSignOut: () => Promise<HubFullUserAccountResult>;
  onSignOutError?: (title: string, message: string) => void;
  /** Cloud hydrate — merge with session cache on open. */
  onLoadActivityLog?: (userId: string) => Promise<HubEntityLogEntry[]>;
  /** Cloud persist after a local append. Return `next` to replace the rail. */
  onPersistActivityLog?: (
    userId: string,
    existing: HubEntityLogEntry[],
    entry: HubEntityLogEntry,
  ) => Promise<{ ok: boolean; next?: HubEntityLogEntry[] } | void>;
  /** Extra content under Status (e.g. Sign in to Hub CTA). */
  statusTrailing?: ReactNode;
  /** Optional workspace note shown under Status. */
  workspaceNote?: string;
};

/** Full account modal — Layout 3 (TOC · Main · Note/Log) SSOT with P0020 Service Log rail. */
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
  onUpdatePassword,
  onUpdateUsername,
  onLoadOwnProfile,
  onUpdateOwnProfile,
  onSignOut,
  onSignOutError,
  onLoadActivityLog,
  onPersistActivityLog,
  statusTrailing,
  workspaceNote,
}: HubFullUserAccountModalProps) {
  const [signingOut, setSigningOut] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resolvedRole, setResolvedRole] = useState<string | null>(null);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [fullNameDraft, setFullNameDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [zaloDraft, setZaloDraft] = useState("");
  const [telegramDraft, setTelegramDraft] = useState("");
  const [metaDraft, setMetaDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [initialProfile, setInitialProfile] = useState<HubOwnProfileFields>(EMPTY_OWN_PROFILE);
  const [activityLog, setActivityLog] = useState<HubEntityLogEntry[]>([]);
  const [usernameOverride, setUsernameOverride] = useState<string | null>(null);
  const [emailOverride, setEmailOverride] = useState<string | null>(null);

  const user = session?.user ?? null;
  const userId = user?.id?.trim() ?? "";
  const labels = hubSessionLabels(session);
  const createdAt = user?.created_at ?? null;
  const lastActiveAt =
    user?.last_sign_in_at ?? (user as { updated_at?: string | null } | null)?.updated_at ?? null;
  const loginDisplay = (usernameOverride ?? labels.loginId) || "—";
  const displayName =
    title ??
    (fullNameDraft.trim() ||
      (loginDisplay !== "—" ? loginDisplay : labels.email) ||
      user?.id?.slice(0, 8) ||
      "User");

  const emailDisplay =
    emailOverride ||
    labels.email ||
    (labels.hasSyntheticAuth ? "Not linked" : labels.authEmail) ||
    "—";

  const canEditUsername = Boolean(onUpdateUsername && session);
  const canEditOwnProfile = Boolean(onUpdateOwnProfile && session);

  const defaultRows: HubWorkspaceUserProfileRow[] = useMemo(() => {
    const roleValue = resolvedRole ?? roleLabel;
    const roleMeta = resolveWorkspaceRoleIcon(roleValue);
    const profileRows: HubWorkspaceUserProfileRow[] = canEditOwnProfile
      ? [
          { label: "Display name", value: fullNameDraft, icon: UserRound },
          { label: "Phone", value: phoneDraft, icon: Phone },
        ]
      : [];
    return [
      { label: "Username", value: loginDisplay, icon: UserRound },
      { label: "Email", value: emailDisplay, icon: Mail },
      { label: "Password", value: "", icon: KeyRound },
      ...profileRows,
      {
        label: "Role",
        value: resolvedRole ? workspaceRoleLabel(resolvedRole) : roleLabel,
        icon: roleMeta.icon,
        iconClassName: roleMeta.className,
      },
      ...(canEditOwnProfile
        ? ([
            { label: "Zalo", value: zaloDraft, icon: MessageSquare },
            { label: "Tele", value: telegramDraft, icon: MessageSquare },
            { label: "Meta", value: metaDraft, icon: MessageSquare },
          ] satisfies HubWorkspaceUserProfileRow[])
        : []),
      { label: "Created", value: createdAt ?? "—", timestamp: createdAt, icon: User },
      { label: "Last active", value: lastActiveAt ?? "—", timestamp: lastActiveAt, icon: Clock },
      { label: "Vault ID", value: userId || "—", icon: Fingerprint },
    ];
  }, [
    loginDisplay,
    emailDisplay,
    session,
    resolvedRole,
    roleLabel,
    createdAt,
    lastActiveAt,
    userId,
    canEditOwnProfile,
    fullNameDraft,
    phoneDraft,
    zaloDraft,
    telegramDraft,
    metaDraft,
  ]);

  const rows = rowsOverride ?? defaultRows;

  const tocItems = useMemo(() => {
    const visible = new Set([
      ...hubUserAccountVisibleSectionIds(rows),
      ...(canEditOwnProfile ? ["hub-user-note"] : []),
      "hub-user-log",
    ]);
    return hubUserAccountTocItems(HUB_FULL_USER_ACCOUNT_TOC.filter((entry) => visible.has(entry.id)));
  }, [rows, canEditOwnProfile]);
  const sectionIds = useMemo(() => tocItems.map((item) => item.id), [tocItems]);

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
    if (!open || !userId) {
      if (!open) setActivityLog([]);
      return;
    }
    const cached = readUserAccountLog(userId);
    setActivityLog(cached);
    if (!onLoadActivityLog) return;
    let cancelled = false;
    void onLoadActivityLog(userId).then((cloud) => {
      if (cancelled) return;
      const merged = mergeHubEntityAuditLogs(cached, cloud);
      setActivityLog(merged);
      writeUserAccountLog(userId, merged);
    });
    return () => {
      cancelled = true;
    };
  }, [open, userId, onLoadActivityLog]);

  useEffect(() => {
    if (!open) {
      setUsernameOverride(null);
      setEmailOverride(null);
      setFullNameDraft("");
      setPhoneDraft("");
      setZaloDraft("");
      setTelegramDraft("");
      setMetaDraft("");
      setNoteDraft("");
      setInitialProfile(EMPTY_OWN_PROFILE);
      return;
    }
    setUsernameDraft(loginDisplay === "—" ? "" : loginDisplay);
    setEmailDraft(emailDisplay === "—" || emailDisplay === "Not linked" ? "" : emailDisplay);
    setPasswordDraft("");
  }, [emailDisplay, loginDisplay, open]);

  useEffect(() => {
    if (!open || !userId || !onLoadOwnProfile) return;
    let cancelled = false;
    void onLoadOwnProfile(userId).then((fields) => {
      if (cancelled || !fields) return;
      setFullNameDraft(fields.fullName);
      setPhoneDraft(fields.phone);
      setZaloDraft(hubZaloValueFromPhone(fields.zalo, fields.phone));
      setTelegramDraft(fields.telegram);
      setMetaDraft(fields.meta);
      setNoteDraft(fields.notes);
      setInitialProfile({
        ...fields,
        zalo: hubZaloValueFromPhone(fields.zalo, fields.phone),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open, userId, onLoadOwnProfile]);

  const commitAccountLog = (entry: HubEntityLogEntry) => {
    setActivityLog((prev) => {
      const next = appendHubEntityLogEntry(prev, entry);
      if (userId) writeUserAccountLog(userId, next);
      if (userId && onPersistActivityLog) {
        void onPersistActivityLog(userId, prev, entry).then((res) => {
          if (res?.ok === false || !Array.isArray(res?.next)) return;
          setActivityLog(res.next);
          writeUserAccountLog(userId, res.next);
        });
      }
      return next;
    });
  };

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
      commitAccountLog({
        at: new Date().toISOString(),
        message: `Email: ${before} → ${email}`,
        changes: [{ field: "email", before, after: email }],
      });
    }
    return result;
  };

  const wrapUpdatePassword = async (password: string) => {
    const result = await onUpdatePassword(password);
    if (result.ok) {
      commitAccountLog({
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
      commitAccountLog({
        at: new Date().toISOString(),
        message: `Username: ${before} → ${username}`,
        changes: [{ field: "username", before, after: username }],
      });
    }
    return result;
  };

  const usernameDirty = canEditUsername && usernameDraft.trim() !== loginDisplay;
  const emailDirty = Boolean(session) && emailDraft.trim().toLowerCase() !== emailDisplay.toLowerCase();
  const passwordDirty = Boolean(session) && passwordDraft.length > 0;
  const profileDirty =
    canEditOwnProfile &&
    (fullNameDraft.trim() !== initialProfile.fullName.trim() ||
      phoneDraft.trim() !== initialProfile.phone.trim() ||
      zaloDraft.trim() !== initialProfile.zalo.trim() ||
      telegramDraft.trim() !== initialProfile.telegram.trim() ||
      metaDraft.trim() !== initialProfile.meta.trim() ||
      noteDraft !== initialProfile.notes);
  const hasAccountChanges = usernameDirty || emailDirty || passwordDirty || profileDirty;

  const handleSave = () => {
    void (async () => {
      if (!hasAccountChanges || saving) return;
      setSaving(true);
      if (usernameDirty) {
        const result = await wrapUpdateUsername(usernameDraft.trim());
        if (!result.ok) {
          setSaving(false);
          onSignOutError?.("Unable to save username", result.message);
          return;
        }
      }
      if (emailDirty) {
        const result = await wrapLinkEmail(emailDraft.trim().toLowerCase());
        if (!result.ok) {
          setSaving(false);
          onSignOutError?.("Unable to save email", result.message);
          return;
        }
      }
      if (passwordDirty) {
        const result = await wrapUpdatePassword(passwordDraft);
        if (!result.ok) {
          setSaving(false);
          onSignOutError?.("Unable to save password", result.message);
          return;
        }
        setPasswordDraft("");
      }
      if (profileDirty && onUpdateOwnProfile) {
        const patch: HubOwnProfilePatch = {
          fullName: fullNameDraft,
          phone: phoneDraft,
          zalo: hubZaloValueFromPhone(zaloDraft, phoneDraft),
          telegram: telegramDraft,
          meta: metaDraft,
          notes: noteDraft,
        };
        const result = await onUpdateOwnProfile(patch);
        if (!result.ok) {
          setSaving(false);
          onSignOutError?.("Unable to save profile", result.message);
          return;
        }
        const changes: HubEntityLogChange[] = [];
        pushHubEntityLogChange(changes, "fullName", initialProfile.fullName, fullNameDraft.trim());
        pushHubEntityLogChange(changes, "phone", initialProfile.phone, phoneDraft.trim());
        pushHubEntityLogChange(changes, "zalo", initialProfile.zalo, zaloDraft.trim());
        pushHubEntityLogChange(changes, "telegram", initialProfile.telegram, telegramDraft.trim());
        pushHubEntityLogChange(changes, "meta", initialProfile.meta, metaDraft.trim());
        pushHubEntityLogChange(changes, "note", initialProfile.notes, noteDraft);
        if (changes.length) {
          commitAccountLog({
            at: new Date().toISOString(),
            message: changes
              .map((change) => {
                const meta = accountLogFieldMeta(change.field);
                return `${meta.label}: ${change.before || "—"} → ${change.after || "—"}`;
              })
              .join(" · "),
            changes,
          });
        }
        setInitialProfile({
          fullName: fullNameDraft.trim(),
          phone: phoneDraft.trim(),
          zalo: zaloDraft.trim(),
          telegram: telegramDraft.trim(),
          meta: metaDraft.trim(),
          notes: noteDraft,
        });
      }
      setSaving(false);
    })();
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
          <HubToolDetailModalAccountFooter
            onClose={onClose}
            onSave={handleSave}
            saveDisabled={!hasAccountChanges || saving || (passwordDirty && passwordDraft.length < 6)}
            busy={saving}
            saveIcon={Save}
            leading={
              <HubToolDetailModalPrimaryAction
                label={signingOut ? "Signing out…" : "Sign Out"}
                onClick={handleSignOut}
                disabled={!session || signingOut || saving}
                busy={signingOut}
                danger
                icon={LogOut}
              />
            }
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
            <HubUserAccountSections
              rows={rows}
              recordMeta={{
                createdAt,
                lastActiveAt,
                vaultId: userId,
              }}
              iconClassNameFor={(row) => row.iconClassName ?? FIELD_ICON_CLASS[row.label] ?? "text-indigo-300"}
              statusTrailing={
                statusTrailing || workspaceNote ? (
                  <>
                    {workspaceNote ? (
                      <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">{workspaceNote}</p>
                    ) : null}
                    {statusTrailing}
                  </>
                ) : undefined
              }
              renderField={(row) => {
                const iconClass =
                  row.iconClassName ?? FIELD_ICON_CLASS[row.label] ?? "text-indigo-300";
                const channelBrand =
                  row.label === "Zalo" || row.label === "Tele" || row.label === "Meta"
                    ? CHANNEL_BRAND[row.label]
                    : undefined;
                const header = {
                  label: row.label,
                  icon: row.icon,
                  iconClassName: iconClass,
                  brandIcon: channelBrand,
                };
                const channelLink =
                  row.label === "Zalo" ? (
                    <HubContactOpenAction
                      channel="zalo"
                      value={hubZaloValueFromPhone(zaloDraft, phoneDraft)}
                      variant="adm"
                    />
                  ) : row.label === "Tele" ? (
                    <HubContactOpenAction channel="telegram" value={telegramDraft} variant="adm" />
                  ) : row.label === "Meta" ? (
                    <HubContactOpenAction channel="meta" value={metaDraft} variant="adm" />
                  ) : undefined;
                if (row.label === "Username" && canEditUsername) {
                  return (
                    <HubAdmClickEditField
                      header={header}
                      fieldLabel="Username"
                      value={usernameDraft}
                      onChange={setUsernameDraft}
                      placeholder="—"
                    />
                  );
                }
                if (row.label === "Email" && session) {
                  return (
                    <HubAdmClickEditField
                      header={header}
                      fieldLabel="Email"
                      value={emailDraft}
                      onChange={setEmailDraft}
                      placeholder="you@company.com"
                      inputMode="email"
                    />
                  );
                }
                if (row.label === "Password" && session) {
                  return (
                    <HubAdmClickEditField
                      header={header}
                      fieldLabel="Password"
                      value={passwordDraft}
                      onChange={setPasswordDraft}
                      displayValue={row.value}
                      placeholder="New password (min 6 characters)"
                      renderEdit={({ value, onChange, onDone, inputRef, className }) => (
                        <input
                          ref={inputRef}
                          className={className}
                          type="password"
                          value={value}
                          placeholder="New password (min 6 characters)"
                          autoComplete="new-password"
                          onChange={(event) => onChange(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape" || event.key === "Enter") onDone();
                          }}
                        />
                      )}
                    />
                  );
                }
                if (row.label === "Display name" && canEditOwnProfile) {
                  return (
                    <HubAdmClickEditField
                      header={header}
                      fieldLabel="Display name"
                      value={fullNameDraft}
                      onChange={setFullNameDraft}
                      placeholder="Display name"
                    />
                  );
                }
                if (row.label === "Phone" && canEditOwnProfile) {
                  return (
                    <HubAdmClickEditField
                      header={header}
                      fieldLabel="Phone"
                      value={phoneDraft}
                      onChange={setPhoneDraft}
                      placeholder="Phone number"
                      inputMode="tel"
                      trailingAction={<HubContactOpenAction channel="phone" value={phoneDraft} variant="adm" />}
                    />
                  );
                }
                if (row.label === "Zalo" && canEditOwnProfile) {
                  return (
                    <HubAdmClickEditField
                      header={header}
                      fieldLabel="Zalo"
                      value={zaloDraft}
                      onChange={setZaloDraft}
                      placeholder="Uses Phone when empty"
                      trailingAction={channelLink}
                    />
                  );
                }
                if (row.label === "Tele" && canEditOwnProfile) {
                  return (
                    <HubAdmClickEditField
                      header={header}
                      fieldLabel="Tele"
                      value={telegramDraft}
                      onChange={setTelegramDraft}
                      placeholder="Telegram ID or @handle"
                      trailingAction={channelLink}
                    />
                  );
                }
                if (row.label === "Meta" && canEditOwnProfile) {
                  return (
                    <HubAdmClickEditField
                      header={header}
                      fieldLabel="Meta"
                      value={metaDraft}
                      onChange={setMetaDraft}
                      placeholder="Messenger ID or handle"
                      trailingAction={channelLink}
                    />
                  );
                }
                if (row.label === "Role" && row.icon) {
                  const RoleIcon = row.icon;
                  return (
                    <HubAdmReadonlyField header={header} valueLayout="text">
                      <span className="inline-flex items-center gap-1.5">
                        <RoleIcon size={12} className={iconClass} aria-hidden />
                        <span>{row.value}</span>
                      </span>
                    </HubAdmReadonlyField>
                  );
                }
                return null;
              }}
            />
          }
          rail={
            <>
              {canEditOwnProfile ? (
                <HubAdmNoteRail
                  id="hub-user-note"
                  mode="editor"
                  title="Note"
                  className="twofa-adm-rail--note"
                  ariaLabel="Note"
                  value={noteDraft}
                  onChange={setNoteDraft}
                  controlClassName="field auth-gate-field hub-adm-note-textarea"
                  placeholder="Optional notes…"
                />
              ) : null}
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
            </>
          }
        />
      </HubToolDetailModal>
    </HubAccountDetailSearchProvider>
  );
}
