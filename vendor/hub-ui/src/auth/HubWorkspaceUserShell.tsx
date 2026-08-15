import { useMemo, useState, type ReactNode } from "react";
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
  workspaceUserFooterLabel,
  workspaceUserInitials,
} from "./workspace-user-session";
import {
  HUB_WORKSPACE_USER_EMPTY_EMAIL,
  HUB_WORKSPACE_USER_FOOTER_TITLE,
} from "../shell/hub-chrome-messages";

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
  const footerUserLabel = workspaceUserFooterLabel({
    labels,
    session,
    anonymous,
    anonymousLabel: anonymousFooterLabel,
    guestLabel: footerGuestLabel,
  });
  const displayTitle =
    modalTitle ??
    (labels.loginId ||
      labels.email ||
      session?.user?.email?.trim() ||
      footerUserLabel);
  const initials = useMemo(
    () => workspaceUserInitials(labels.email || session?.user?.email, session?.user?.id),
    [labels.email, session?.user?.email, session?.user?.id],
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
