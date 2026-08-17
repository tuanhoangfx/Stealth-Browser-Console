import { useHubIdentityRelayReceive, type HubIdentityRelaySnapshot } from "./hub-identity-relay";
import { useHubIdentityRefreshEffect } from "./workspace-auth-session";

export type WorkspaceAuthBootCoreConfig = {
  isToolHubOrigin: (origin: string) => boolean;
  onHubRelayReceived: (snapshot: HubIdentityRelaySnapshot) => void;
  onIdentityRefresh: () => void;
  identityRefreshDebounceMs?: number;
  syncHubIdentityLabels?: () => void;
};

/**
 * Shared Hub relay receive + identity-cache refresh effect.
 * Hub-primary / data-primary boots keep their own GoTrue listener + policy.
 */
export function useWorkspaceAuthBootCore(config: WorkspaceAuthBootCoreConfig): void {
  useHubIdentityRelayReceive({
    isToolHubOrigin: config.isToolHubOrigin,
    onReceived: config.onHubRelayReceived,
  });

  useHubIdentityRefreshEffect(config.onIdentityRefresh, {
    debounceMs: config.identityRefreshDebounceMs ?? 400,
    syncLabels: config.syncHubIdentityLabels,
  });
}
