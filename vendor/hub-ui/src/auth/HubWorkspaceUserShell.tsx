import { useMemo, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hubSessionLabels, type HubSessionLike } from "@tool-workspace/hub-identity";
import { HubSidebarUserFooter } from "./HubSidebarUserFooter";
import { HubWorkspaceUserModal } from "./HubWorkspaceUserModal";
import { useWorkspaceRoleKey } from "./useWorkspaceRoleKey";
import { resolveWorkspaceRoleIcon } from "./hub-workspace-role-icon";
import { compactIconSize } from "../ui-scale";
import {
  buildWorkspaceUserProfileRows,
  workspaceUserFooterLabel,
  workspaceUserInitials,
} from "./workspace-user-session";

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
  /** Return false to keep modal open (e.g. sign-out error toast). Omit when using `renderModal`. */
  onSignOut?: () => boolean | void | Promise<boolean | void>;
  /** P0004 — swap in HubFullUserAccountModal while keeping shared footer. */
  renderModal?: (ctx: HubWorkspaceUserModalRenderContext) => ReactNode;
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

/** Sidebar User footer + workspace account modal — single config (P0020 / P0016). */
export function HubWorkspaceUserShell({
  session,
  anonymous = false,
  onSignOut,
  modalTitle,
  footerTitle = "Account & sign out",
  footerGuestLabel,
  anonymousFooterLabel,
  workspaceNote,
  includeLoginId = false,
  emptyEmailLabel,
  labels: labelsProp,
  roleKey: roleKeyProp,
  onResolveRoleKey,
  profileRoleClient,
  profileRoleUserId,
  profileRoleEmail,
  onPrepareProfileRoleClient,
  renderModal,
}: HubWorkspaceUserShellProps) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

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
  const roleMeta = useMemo(() => resolveWorkspaceRoleIcon(roleKey), [roleKey]);
  const RoleIcon = roleMeta.icon;

  const modalCtx: HubWorkspaceUserModalRenderContext = {
    open,
    onClose: () => setOpen(false),
    signingOut,
    displayTitle,
    initials,
    profileRows,
    footerUserLabel,
    roleKey,
    labels,
  };

  const handleSignOut = () => {
    if (!onSignOut) return;
    void (async () => {
      setSigningOut(true);
      try {
        const ok = await onSignOut();
        if (ok !== false) setOpen(false);
      } finally {
        setSigningOut(false);
      }
    })();
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
        <HubWorkspaceUserModal
          open={open}
          onClose={() => setOpen(false)}
          title={displayTitle}
          userId={session?.user?.id ?? null}
          sessionActive={Boolean(session) && !anonymous}
          signingOut={signingOut}
          onSignOut={handleSignOut}
          workspaceNote={workspaceNote}
          headerLeading={
            <span
              className={`user-access-modal__avatar grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-indigo-300/25 bg-indigo-500/20 transition-opacity ${roleIconPending ? "opacity-0" : ""}`}
              aria-hidden
            >
              <RoleIcon size={compactIconSize(16)} className={roleMeta.className} />
            </span>
          }
          rows={profileRows}
        />
      )}
    </>
  );
}
