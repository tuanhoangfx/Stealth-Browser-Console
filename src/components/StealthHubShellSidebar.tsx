import { useEffect } from "react";
import { Database, LogIn, MonitorSmartphone, Smartphone } from "lucide-react";
import { hubSessionLabels } from "@tool-workspace/hub-identity";
import {
  HubLogButton,
  HubSidebarBrandIcon,
  HubSidebarNavList,
  HubSidebarShell,
  HubSystemTabSubNav,
  HubWorkspaceUserShell,
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
import type { StealthAndroidTab } from "../lib/stealth-android-tab";
import { isStealthAndroidTab } from "../lib/stealth-android-tab";
import type { StealthScreen } from "../lib/stealth-screen";
import type { StealthSystemTab } from "../lib/stealth-system-tab";
import type { StealthWorkflowTab } from "../lib/stealth-workflow-tab";
import { isStealthSystemTab } from "../lib/stealth-system-tab";
import { isStealthWorkflowTab } from "../lib/stealth-workflow-tab";

/** P0004/P0016 golden — `HubSidebarNavList` + `STEALTH_NAV_STRUCTURE` + shared `HubSystemTabSubNav`. */
export function StealthHubShellSidebar({
  screen,
  androidTab,
  systemTab,
  workflowTab,
  onNavigate,
  onAndroidTabChange,
  onSystemTabChange,
  onWorkflowTabChange,
  onRequestHubSignIn,
}: {
  screen: StealthScreen;
  androidTab: StealthAndroidTab;
  systemTab: StealthSystemTab;
  workflowTab: StealthWorkflowTab;
  onNavigate: (screen: StealthScreen) => void;
  onAndroidTabChange: (tab: StealthAndroidTab) => void;
  onSystemTabChange: (tab: StealthSystemTab) => void;
  onWorkflowTabChange: (tab: StealthWorkflowTab) => void;
  onRequestHubSignIn?: () => void;
}) {
  const hubAuthEnabled = isStealthHubAuthEnabled();
  const { session, offline, authRequired, signOut } = useStealthAuth();
  const showAnonymous = hubAuthEnabled && (offline || (!authRequired && !session));
  const { groupOpen, setGroupSubnavOpen } = useNavGroupOpenState(STEALTH_NAV_SUBNAV_PREFIX, STEALTH_NAV_GROUP_IDS);
  const labels = hubSessionLabels(session);
  const { roleKey } = useWorkspaceRoleKey(session, {
    profileRoleClient: getIdentitySupabase() as never,
    profileRoleUserId: session?.user?.id,
    profileRoleEmail: session?.user?.email,
  });

  useEffect(() => {
    const win = window as unknown as {
      __HUB_ELECTRON_DEV__?: boolean;
      __HUB_ELECTRON_DEV_INFO__?: string;
      __HUB_ELECTRON_VERSION__?: string;
      stealthApi?: {
        appInfo?: () => Promise<{
          isPackaged?: boolean;
          isDev?: boolean;
          version?: string;
          apiPort?: number;
          userDataPath?: string;
        }>;
      };
    };
    if (typeof win.stealthApi?.appInfo === "function") {
      win.stealthApi
        .appInfo()
        .then((info) => {
          if (info?.version) {
            win.__HUB_ELECTRON_VERSION__ = info.version;
          }
          if (info && (info.isDev === true || info.isPackaged === false)) {
            win.__HUB_ELECTRON_DEV__ = true;
            const portStr = info.apiPort ? `:${info.apiPort}` : ":6004";
            const folder = info.userDataPath
              ? info.userDataPath.split(/[/\\]/).filter(Boolean).pop() || info.userDataPath
              : "stealth-browser-console-dev";
            win.__HUB_ELECTRON_DEV_INFO__ = `Isolated Dev Instance · API ${portStr} · UserData: ${folder}`;
            document.title = STEALTH_PRODUCT.name;
            window.dispatchEvent(new Event("hub:electron-dev-ready"));
          }
        })
        .catch(() => {});
    }
  }, []);

  return (
    <HubSidebarShell
      brandLeading={<HubSidebarBrandIcon src={STEALTH_BRAND_ICON} alt={STEALTH_PRODUCT.name} />}
      brandTitle={STEALTH_PRODUCT.name}
      nav={
        <HubSidebarNavList
          structure={STEALTH_NAV_STRUCTURE}
          activeScreen={screen}
          activeView={
            screen === "android"
              ? androidTab
              : screen === "system"
                ? systemTab
                : screen === "workflow"
                  ? workflowTab
                  : null
          }
          groupOpen={groupOpen}
          setGroupSubnavOpen={setGroupSubnavOpen}
          showToggleIcon={false}
          renderGroupSubnav={(entry) => {
            if (entry.id !== "antidetect") return undefined;
            const activeSubId =
              screen === "profiles"
                ? "profiles"
                : screen === "android"
                  ? androidTab === "farm"
                    ? "farm"
                    : "android"
                  : null;
            return (
              <HubSystemTabSubNav
                activeId={activeSubId}
                items={[
                  {
                    id: "profiles",
                    label: "Profiles",
                    icon: Database,
                    iconTone: "emerald",
                  },
                  {
                    id: "android",
                    label: "Android",
                    icon: Smartphone,
                    iconTone: "emerald",
                  },
                  {
                    id: "farm",
                    label: "Mobile Farm",
                    icon: MonitorSmartphone,
                    iconTone: "sky",
                  },
                ]}
                onSelect={(id) => {
                  if (id === "profiles") {
                    onNavigate("profiles");
                    return;
                  }
                  if (id === "android") {
                    onNavigate("android");
                    onAndroidTabChange("profiles");
                    return;
                  }
                  if (id === "farm") {
                    onNavigate("android");
                    onAndroidTabChange("farm");
                  }
                }}
              />
            );
          }}
          onNavigateScreen={onNavigate}
          onSelectView={(view, parentScreen) => {
            if (parentScreen === "android" && isStealthAndroidTab(view)) {
              onNavigate("android");
              onAndroidTabChange(view);
              return;
            }
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
            getHubClient={() => getIdentitySupabase() as never}
            profileRoleClient={getIdentitySupabase() as never}
            profileRoleUserId={session?.user?.id}
            profileRoleEmail={session?.user?.email}
            footerTitle="Open workspace user information"
            footerGuestLabel="Local console"
            emptyEmailLabel={hubAuthEnabled ? "Not signed in" : "Local console"}
            workspaceNote={
              !hubAuthEnabled
                ? "Local console — Hub login is off (VITE_STEALTH_HUB_AUTH). Enable it in .env.local to use workspace sign-in."
                : showAnonymous
                  ? "Anonymous mode — Stealth runs locally. Hub sign-in links workspace identity."
                  : hubAuthEnabled && isHubSupabaseConfigured
                    ? "Stealth Browser Console — signed-in Hub workspace identity."
                    : undefined
            }
            statusTrailing={
              hubAuthEnabled && onRequestHubSignIn && (showAnonymous || !session) ? (
                <div className="auth-inline-actions mt-3">
                  <button
                    type="button"
                    className="auth-inline-btn"
                    onClick={() => onRequestHubSignIn()}
                  >
                    <LogIn size={14} aria-hidden />
                    <span>Sign in to Hub</span>
                  </button>
                </div>
              ) : undefined
            }
            onSignOut={async () => {
              setOfflineMode(false);
              await signOut();
              return true;
            }}
          />
          <HubLogButton variant="global" />
          <StealthDisplayPrefs screen={screen} sidebarRow scope="global" settingsMode="general" />
        </>
      }
    />
  );
}
