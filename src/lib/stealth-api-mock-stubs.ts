import { STEALTH_API_CHANNELS } from "./stealth-api-channel-list";

type StealthApiLike = NonNullable<typeof window.stealthApi>;

const WEB_REJECT_MSG = "Requires Electron + CloakBrowser (pnpm dev).";

function rejectStub(label: string) {
  return async () => {
    throw new Error(`${label} ${WEB_REJECT_MSG}`);
  };
}

function noopSubscription() {
  return () => undefined;
}

function okStub<T>(value: T) {
  return async () => value;
}

/** Default web-mock surface from manifest — override profile/engine methods in stealth-web-mock. */
export function buildStealthApiStubLayer(): Partial<StealthApiLike> {
  const layer: Record<string, unknown> = {};

  for (const row of STEALTH_API_CHANNELS) {
    if (row.kind === "on") {
      layer[row.method] = noopSubscription;
      continue;
    }
    if (row.web === "reject") {
      layer[row.method] = rejectStub(row.method);
      continue;
    }
    layer[row.method] = okStub({ ok: false, error: `Web mock stub: ${row.method}` });
  }

  return layer as Partial<StealthApiLike>;
}

export function assertStealthApiChannelCoverage(api: Partial<StealthApiLike>) {
  const missing = STEALTH_API_CHANNELS.map((row) => row.method).filter(
    (method) => typeof api[method as keyof StealthApiLike] !== "function",
  );
  if (missing.length) {
    throw new Error(`stealth web mock missing methods: ${missing.join(", ")}`);
  }
}
