/** Electron child env — product defaults override stale STEALTH_COOKIE_BRIDGE=0. */
export function stealthElectronEnv(extra = {}) {
  const env = {
    ...process.env,
    STEALTH_COOKIE_BRIDGE: "1",
    STEALTH_FAST_LAUNCH: process.env.STEALTH_FAST_LAUNCH ?? "1",
    ...extra,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
