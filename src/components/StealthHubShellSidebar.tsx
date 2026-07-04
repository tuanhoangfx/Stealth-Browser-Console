import { useCallback, useEffect, useState } from "react";
import { LogIn, RefreshCcw } from "lucide-react";
import { hubSessionLabels } from "@tool-workspace/hub-identity";
import {
  HubLogButton,
  HubSidebarFooterButton,
  HubSidebarNavList,
  HubSidebarShell,
  HubToolAvatar,
  HubUiZoomControl,
  HubWorkspaceUserAvatar,
  HubWorkspaceUserModal,
  HubWorkspaceUserShell,
  readHubListPrefsCore,
  subscribeHubListPrefs,
  useNavGroupOpenState,
  useWorkspaceRoleKey,
} from "@tool-workspace/hub-ui";
import { StealthDisplayPrefs } from "./StealthDisplayPrefs";
import { useStealthAuth } from "../features/auth/AuthSessionProvider";
import { isStealthHubAuthEnabled } from "../lib/stealth-auth-policy";
import { setOfflineMode } from "../lib/offlineMode";
import {
  STEALTH_NAV_GROUP_IDS,
  STEALTH_NAV_STRUCTURE,
  STEALTH_NAV_SUBNAV_PREFIX,
} from "../lib/stealth-nav-structure";
import { STEALTH_BRAND_ICON, STEALTH_PRODUCT } from "../lib/stealth-product";
import { prefetchSystemChunks, prefetchWorkflowChunks } from "../lib/prefetch-workflow-chunks";
import { isHubSupabaseConfigured } from "../lib/hub-supabase-env";
import { getIdentitySupabase } from "../lib/supabase-identity";
import type { StealthScreen } from "../lib/stealth-screen";
import type { StealthSystemTab } from "../lib/stealth-system-tab";
import type { StealthWorkflowTab } from "../lib/stealth-workflow-tab";
import { isStealthSystemTab } from "../lib/stealth-system-tab";
import { isStealthWorkflowTab } from "../lib/stealth-workflow-tab";

/** P0004/P0016 golden — `HubSidebarNavList` + `STEALTH_NAV_STRUCTURE` + shared `HubSystemTabSubNav`. */
export function StealthHubShellSidebar({
  screen,
  systemTab,
  workflowTab,
  onNavigate,
  onSystemTabChange,
  onWorkflowTabChange,
  onRefresh,
  refreshBusy = false,
  onRequestHubSignIn,
}: {
  screen: StealthScreen;
  systemTab: StealthSystemTab;
  workflowTab: StealthWorkflowTab;
  onNavigate: (screen: StealthScreen) => void;
  onSystemTabChange: (tab: StealthSystemTab) => void;
  onWorkflowTabChange: (tab: StealthWorkflowTab) => void;
  onRefresh: () => void;
  refreshBusy?: boolean;
  onRequestHubSignIn?: () => void;
}) {
  const hubAuthEnabled = isStealthHubAuthEnabled();
  const { session, offline, signOut } = useStealthAuth();
  const showAnonymous = hubAuthEnabled && offline;
  const { groupOpen, setGroupSubnavOpen } = useNavGroupOpenState(STEALTH_NAV_SUBNAV_PREFIX, STEALTH_NAV_GROUP_IDS);
  const [showSubnavToggleIcon, setShowSubnavToggleIcon] = useState(() => {
    const prefs = readHubListPrefsCore() as { navToggleIcon?: boolean };
    return Boolean(prefs.navToggleIcon);
  });
  const [refreshing, setRefreshing] = useState(false);
  const labels = hubSessionLabels(session);
  const { roleKey } = useWorkspaceRoleKey(session, {
    profileRoleClient: getIdentitySupabase() as never,
    profileRoleUserId: session?.user?.id,
    profileRoleEmail: session?.user?.email,
  });

  useEffect(
    () =>
      subscribeHubListPrefs(() => {
        const prefs = readHubListPrefsCore() as { navToggleIcon?: boolean };
        setShowSubnavToggleIcon(Boolean(prefs.navToggleIcon));
      }),
    [],
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    onRefresh();
    window.setTimeout(() => setRefreshing(false), 600);
  }, [onRefresh]);

  const listRefreshing = refreshing || refreshBusy;

  return (
    <HubSidebarShell
      brandLeading={
        <HubToolAvatar code={STEALTH_PRODUCT.code} size="md" svgSrc={STEALTH_BRAND_ICON} />
      }
      brandTitle={STEALTH_PRODUCT.name}
      nav={
        <HubSidebarNavList
          structure={STEALTH_NAV_STRUCTURE}
          activeScreen={screen}
          activeView={
            screen === "system" ? systemTab : screen === "workflow" ? workflowTab : null
          }
          groupOpen={groupOpen}
          setGroupSubnavOpen={setGroupSubnavOpen}
          showToggleIcon={showSubnavToggleIcon}
          onNavigateScreen={onNavigate}
          onSelectView={(view, parentScreen) => {
            if (parentScreen === "system" && isStealthSystemTab(view)) {
              onNavigate("system");
              onSystemTabChange(view);
              return;
            }
            if (parentScreen === "workflow" && isStealthWorkflowTab(view)) {
              onNavigate("workflow");
              onWorkflowTabChange(view);
            }
          }}
          onPrefetchScreen={(next) => {
            if (next === "workflow") prefetchWorkflowChunks();
            if (next === "system") prefetchSystemChunks();
          }}
          onPrefetchView={(view) => {
            if (view === "store" || view === "editor") prefetchWorkflowChunks();
            else prefetchSystemChunks();
          }}
        />
      }
      footer={
        <>
          <HubWorkspaceUserShell
            session={session}
            anonymous={showAnonymous}
            labels={labels}
            roleKey={roleKey}
            profileRoleClient={getIdentitySupabase() as never}
            profileRoleUserId={session?.user?.id}
            profileRoleEmail={session?.user?.email}
            footerTitle="Open workspace user information"
            footerGuestLabel="Local console"
            emptyEmailLabel={hubAuthEnabled ? "Not signed in" : "Local console"}
            workspaceNote={
              showAnonymous
                ? "Anonymous mode — Stealth runs locally. Hub sign-in links workspace identity."
                : hubAuthEnabled && isHubSupabaseConfigured
                  ? "Stealth Browser Console — signed-in Hub workspace identity."
                  : undefined
            }
            onSignOut={async () => {
              setOfflineMode(false);
              await signOut();
              return true;
            }}
            renderModal={(ctx) => (
              <HubWorkspaceUserModal
                open={ctx.open}
                onClose={ctx.onClose}
                title={ctx.displayTitle}
                userId={session?.user?.id ?? null}
                sessionActive={Boolean(session) && !showAnonymous}
                showSignOut={hubAuthEnabled && Boolean(session) && !showAnonymous}
                signingOut={ctx.signingOut}
                onSignOut={() => {
                  if (!ctx.signingOut) {
                    void (async () => {
                      setOfflineMode(false);
                      await signOut();
                      ctx.onClose();
                    })();
                  }
                }}
                workspaceNote={
                  !hubAuthEnabled
                    ? "Local console — Hub login is off (VITE_STEALTH_HUB_AUTH). Enable it in .env.local to use workspace sign-in."
                    : showAnonymous
                    ? "Anonymous mode — Stealth runs locally. Hub sign-in links workspace identity."
                    : hubAuthEnabled && isHubSupabaseConfigured
                      ? "Stealth Browser Console — signed-in Hub workspace identity."
                      : undefined
                }
                headerLeading={<HubWorkspaceUserAvatar initials={ctx.initials} />}
                rows={ctx.profileRows}
              >
                {hubAuthEnabled && onRequestHubSignIn && (showAnonymous || !session) ? (
                  <div className="auth-inline-actions mt-3">
                    <button
                      type="button"
                      className="auth-inline-btn"
                      onClick={() => {
                        ctx.onClose();
                        onRequestHubSignIn();
                      }}
                    >
                      <LogIn size={14} aria-hidden />
                      <span>Sign in to Hub</span>
                    </button>
                  </div>
                ) : null}
              </HubWorkspaceUserModal>
            )}
          />
          <HubSidebarFooterButton
            icon={RefreshCcw}
            iconClass="text-emerald-300"
            label={listRefreshing ? "Updating…" : "Refresh"}
            onClick={handleRefresh}
            disabled={refreshBusy}
            loading={listRefreshing}
            title="Refresh active tab data"
          />
          <HubLogButton variant="global" />
          <StealthDisplayPrefs screen={screen} sidebarRow scope="global" settingsMode="general" />
          <HubUiZoomControl />
        </>
      }
    />
  );
}
