/** Patch missing preload methods on live Electron — never replace IPC with web mock. */
const STEALTH_API_BASES = ["http://127.0.0.1:6004", "http://127.0.0.1:6003"];

function isLiveElectronBridge(api: NonNullable<typeof window.stealthApi>): boolean {
  return typeof api.closeProfile === "function" && typeof api.launchProfile === "function";
}

async function fetchStealthApiJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  for (const base of STEALTH_API_BASES) {
    try {
      const res = await fetch(`${base}${path}`, init);
      if (!res.ok) continue;
      return (await res.json()) as T;
    } catch {
      // try next port
    }
  }
  return null;
}

export function patchStealthElectronBridgeGaps() {
  if (typeof window === "undefined" || !window.stealthApi) return;
  const live = window.stealthApi;
  if (!isLiveElectronBridge(live)) return;

  const bridge = live as Record<string, unknown>;

  if (typeof bridge.listRunningProfiles !== "function") {
    bridge.listRunningProfiles = async () => {
      const data = await fetchStealthApiJson<{ ok: boolean; sessions: Array<{ id: string; name: string; headless?: boolean }> }>(
        "/api/sessions/running",
      );
      return data ?? { ok: true, sessions: [] };
    };
  }

  if (typeof bridge.closeAllProfiles !== "function") {
    bridge.closeAllProfiles = async () => {
      const direct = await fetchStealthApiJson<{ ok: boolean; count: number; ids: string[] }>(
        "/api/sessions/close-all",
        { method: "POST" },
      );
      if (direct?.ok) return direct;

      const listed = await (bridge.listRunningProfiles as () => Promise<{ sessions: Array<{ id: string; name?: string }> }>)();
      const sessions = listed?.sessions ?? [];
      const closeFn = bridge.closeProfile as ((payload: { id: string; name?: string }) => Promise<unknown>) | undefined;
      if (typeof closeFn === "function") {
        for (const session of sessions) {
          await closeFn.call(live, { id: session.id, name: session.name });
        }
        return { ok: true, count: sessions.length, ids: sessions.map((row) => row.id) };
      }

      throw new Error("closeAllProfiles unavailable — restart Stealth Browser Console.");
    };
  }
}
