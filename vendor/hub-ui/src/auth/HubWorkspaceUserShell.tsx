import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createHubFullAccountAuthHandlers,
  hubSessionLabels,
  type HubSessionLike,
} from "@tool-workspace/hub-identity";
import { HubSidebarUserFooter } from "./HubSidebarUserFooter";
import { HubFullUserAccountModal } from "./HubFullUserAccountModal";
import { createHubProfilesActivityLogHandlers } from "./hub-profiles-activity-log";
import { useWorkspaceRoleKey } from "./useWorkspaceRoleKey";
import { workspaceRoleLabel } from "./hub-workspace-role-icon";
import {
  buildWorkspaceUserProfileRows,
  isUnstableWorkspaceFooterLabel,
  workspaceUserFooterLabel,
  workspaceUserInitials,
} from "./workspace-user-session";
import {
  HUB_WORKSPACE_USER_EMPTY_EMAIL,
  HUB_WORKSPACE_USER_FOOTER_TITLE,
} from "../shell/hub-chrome-messages";

type FooterProfileFields = { fullName: string | null; loginId: string | null };

/** Remount-safe cache — footer label must not re-hit profiles on every shell paint. */
const footerProfileCache = new Map<string, FooterProfileFields>();

export type HubWorkspaceUserModalRenderContext = {
  open: boolean;
  onClose: () => void;
  signingOut: boolean;
  displayTitle: string;
  initials: string;
  profileRows: ReturnType<typeof buildWorkspaceUserProfileRows>;
  footerUserLabel: string;
  roleKey: string;
  labels: ReturnType<typeof hubSessionLabels>;
};

export type HubWorkspaceUserShellProps = {
  session: HubSessionLike;
  anonymous?: boolean;
  /** Return false to keep modal open (e.g. sign-out error toast). */
  onSignOut?: () => boolean | void | Promise<boolean | void>;
  /**
   * Escape hatch only (dual-auth custom modal, rare host overrides).
   * Default sidebar account UI is `HubFullUserAccountModal` via shared handlers.
   */
  renderModal?: (ctx: HubWorkspaceUserModalRenderContext) => ReactNode;
  /** Hub identity client for Full account auth + activity log (preferred over `renderModal`). */
  getHubClient?: () => SupabaseClient | null;
  /** Await before each Hub auth/DB call (apply Hub identity session, etc.). */
  prepareHubClient?: () => Promise<void>;
  /** Mirror password sync API — defaults to hub-identity route helper. */
  syncApiUrl?: string | (() => string);
  onSignOutError?: (title: string, message: string) => void;
  /** Extra content under Status (e.g. Sign in to Hub CTA). */
  statusTrailing?: ReactNode;
  /** Force Full modal open (dev smoke query params). */
  forceModalOpen?: boolean;
  modalTitle?: string;
  footerTitle?: string;
  footerGuestLabel?: string;
  anonymousFooterLabel?: string;
  workspaceNote?: string;
  includeLoginId?: boolean;
  emptyEmailLabel?: string;
  labels?: ReturnType<typeof hubSessionLabels>;
  roleKey?: string;
  /** Resolve `profiles.role` when JWT metadata is stale (Hub Users SSOT). */
  onResolveRoleKey?: (userId: string) => Promise<string | null | undefined>;
  /** Preferred — fetch + realtime `profiles.role` via Supabase client. */
  profileRoleClient?: SupabaseClient | null;
  /** Hub identity user id when `session` is a tool-local auth user (P0020). */
  profileRoleUserId?: string | null;
  profileRoleEmail?: string | null;
  onPrepareProfileRoleClient?: (client: SupabaseClient) => Promise<void>;
};

/** Sidebar User footer + Full User Account modal — single config for every Hub host. */
export function HubWorkspaceUserShell({
  session,
  anonymous = false,
  onSignOut,
  modalTitle,
  footerTitle = HUB_WORKSPACE_USER_FOOTER_TITLE,
  footerGuestLabel,
  anonymousFooterLabel,
  workspaceNote,
  includeLoginId = false,
  emptyEmailLabel = HUB_WORKSPACE_USER_EMPTY_EMAIL,
  labels: labelsProp,
  roleKey: roleKeyProp,
  onResolveRoleKey,
  profileRoleClient,
  profileRoleUserId,
  profileRoleEmail,
  onPrepareProfileRoleClient,
  renderModal,
  getHubClient,
  prepareHubClient,
  syncApiUrl,
  onSignOutError,
  statusTrailing,
  forceModalOpen = false,
}: HubWorkspaceUserShellProps) {
  const [open, setOpen] = useState(false);
  const [footerDisplayName, setFooterDisplayName] = useState<string | null>(null);
  const [footerUsername, setFooterUsername] = useState<string | null>(null);

  const labels = labelsProp ?? hubSessionLabels(session);
  const { roleKey, roleIconPending } = useWorkspaceRoleKey(session, {
    anonymous,
    roleKey: roleKeyProp,
    onResolveRoleKey,
    profileRoleClient,
    profileRoleUserId,
    profileRoleEmail,
    onPrepareProfileRoleClient,
  });
  const resolveClient = useMemo(
    () => getHubClient ?? (() => profileRoleClient ?? null),
    [getHubClient, profileRoleClient],
  );
  const prepareClient = useMemo(() => {
    if (prepareHubClient) return prepareHubClient;
    if (onPrepareProfileRoleClient) {
      return async () => {
        const client = resolveClient();
        if (client) await onPrepareProfileRoleClient(client);
      };
    }
    return undefined;
  }, [prepareHubClient, onPrepareProfileRoleClient, resolveClient]);

  const accountHandlers = useMemo(
    () =>
      createHubFullAccountAuthHandlers({
        getClient: resolveClient,
        prepareClient,
        syncApiUrl,
        getLoginId: () => labels.loginId,
      }),
    [resolveClient, prepareClient, syncApiUrl, labels.loginId],
  );
  const fetchOwnProfileFieldsRef = useRef(accountHandlers.fetchOwnProfileFields);
  fetchOwnProfileFieldsRef.current = accountHandlers.fetchOwnProfileFields;

  const profileUserId = profileRoleUserId?.trim() || session?.user?.id?.trim() || "";
  const stickyFooterLabelRef = useRef("");

  useEffect(() => {
    stickyFooterLabelRef.current = "";
  }, [profileUserId]);

  useEffect(() => {
    if (anonymous || !profileUserId) {
      setFooterDisplayName(null);
      setFooterUsername(null);
      return;
    }
    const cached = footerProfileCache.get(profileUserId);
    if (cached) {
      setFooterDisplayName(cached.fullName);
      setFooterUsername(cached.loginId);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const fields = await fetchOwnProfileFieldsRef.current(profileUserId);
        if (cancelled) return;
        const next: FooterProfileFields = {
          fullName: fields?.fullName?.trim() || null,
          loginId: fields?.loginId?.trim() || null,
        };
        footerProfileCache.set(profileUserId, next);
        setFooterDisplayName(next.fullName);
        setFooterUsername(next.loginId);
      } catch {
        if (!cancelled) {
          setFooterDisplayName(null);
          setFooterUsername(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [anonymous, profileUserId]);

  const rawFooterLabel = workspaceUserFooterLabel({
    labels,
    session,
    anonymous,
    anonymousLabel: anonymousFooterLabel,
    guestLabel: footerGuestLabel,
    displayName: footerDisplayName,
    username: footerUsername,
  });
  if (!anonymous && !isUnstableWorkspaceFooterLabel(rawFooterLabel)) {
    stickyFooterLabelRef.current = rawFooterLabel;
  }
  const footerUserLabel =
    anonymous || !isUnstableWorkspaceFooterLabel(rawFooterLabel)
      ? rawFooterLabel
      : stickyFooterLabelRef.current || footerGuestLabel || "Sign in";
  const displayTitle =
    modalTitle ??
    (footerUserLabel ||
      labels.loginId ||
      labels.displayName ||
      labels.email ||
      "User");
  const initials = useMemo(
    () =>
      workspaceUserInitials(
        footerDisplayName || labels.displayName || labels.email || labels.loginId,
        session?.user?.id,
      ),
    [footerDisplayName, labels.displayName, labels.email, labels.loginId, session?.user?.id],
  );
  const profileRows = useMemo(
    () =>
      buildWorkspaceUserProfileRows({
        session,
        labels,
        includeLoginId,
        emptyEmailLabel,
        roleKey,
      }),
    [session, labels, includeLoginId, emptyEmailLabel, roleKey],
  );
  const activityLog = useMemo(
    () => createHubProfilesActivityLogHandlers(resolveClient),
    [resolveClient],
  );

  const modalOpen = forceModalOpen || open;
  const modalCtx: HubWorkspaceUserModalRenderContext = {
    open: modalOpen,
    onClose: () => setOpen(false),
    signingOut: false,
    displayTitle,
    initials,
    profileRows,
    footerUserLabel,
    roleKey,
    labels,
  };

  const handleFullModalSignOut = async () => {
    if (!onSignOut) return { ok: true, message: "" };
    try {
      const ok = await onSignOut();
      if (ok === false) return { ok: false, message: "Sign out failed." };
      return { ok: true, message: "" };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  };

  return (
    <>
      <HubSidebarUserFooter
        footerUserLabel={footerUserLabel}
        title={footerTitle}
        roleKey={roleKey}
        roleIconPending={roleIconPending}
        onOpenUser={() => setOpen(true)}
      />
      {renderModal ? (
        renderModal(modalCtx)
      ) : (
        <HubFullUserAccountModal
          open={modalOpen}
          onClose={() => setOpen(false)}
          session={session}
          identityUserId={profileRoleUserId}
          title={displayTitle}
          initials={initials}
          roleLabel={workspaceRoleLabel(roleKey)}
          workspaceNote={workspaceNote}
          statusTrailing={statusTrailing}
          onResolveRole={accountHandlers.onResolveRole}
          onUpdateUsername={accountHandlers.onUpdateUsername}
          onLinkEmail={accountHandlers.onLinkEmail}
          onUpdatePassword={accountHandlers.onUpdatePassword}
          onLoadOwnProfile={accountHandlers.fetchOwnProfileFields}
          onUpdateOwnProfile={accountHandlers.onUpdateOwnProfile}
          onSignOut={handleFullModalSignOut}
          onSignOutError={onSignOutError}
          onLoadActivityLog={activityLog.fetchUserActivityLog}
          onPersistActivityLog={activityLog.persistUserActivityLog}
        />
      )}
    </>
  );
}
