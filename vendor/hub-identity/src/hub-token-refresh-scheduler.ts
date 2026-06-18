export type HubTokenRefreshSchedulerConfig = {
  isHubConfigured: () => boolean;
  refreshRequestToken: () => Promise<string | null>;
  refreshIntervalMs?: number;
  visibilityDebounceMs?: number;
};

export type HubTokenRefreshSchedulerBundle = {
  startHubTokenRefreshScheduler: () => void;
  stopHubTokenRefreshScheduler: () => void;
};

/** Proactive Hub JWT refresh — interval + debounced visibility resume. */
export function createHubTokenRefreshScheduler(
  config: HubTokenRefreshSchedulerConfig,
): HubTokenRefreshSchedulerBundle {
  const refreshIntervalMs = config.refreshIntervalMs ?? 50 * 60 * 1000;
  const visibilityDebounceMs = config.visibilityDebounceMs ?? 800;

  let timerId: ReturnType<typeof setInterval> | null = null;
  let bound = false;
  let visibilityTimer: ReturnType<typeof setTimeout> | null = null;

  function tick() {
    void config.refreshRequestToken();
  }

  function onVisibility() {
    if (document.visibilityState !== "visible") return;
    if (visibilityTimer != null) clearTimeout(visibilityTimer);
    visibilityTimer = setTimeout(() => {
      visibilityTimer = null;
      void config.refreshRequestToken();
    }, visibilityDebounceMs);
  }

  function startHubTokenRefreshScheduler(): void {
    if (!config.isHubConfigured() || timerId != null) return;
    void config.refreshRequestToken();
    timerId = setInterval(tick, refreshIntervalMs);
    if (!bound) {
      document.addEventListener("visibilitychange", onVisibility);
      bound = true;
    }
  }

  function stopHubTokenRefreshScheduler(): void {
    if (timerId != null) {
      clearInterval(timerId);
      timerId = null;
    }
    if (visibilityTimer != null) {
      clearTimeout(visibilityTimer);
      visibilityTimer = null;
    }
    if (bound) {
      document.removeEventListener("visibilitychange", onVisibility);
      bound = false;
    }
  }

  return { startHubTokenRefreshScheduler, stopHubTokenRefreshScheduler };
}
