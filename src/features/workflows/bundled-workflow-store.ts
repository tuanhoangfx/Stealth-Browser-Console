import bundledManifest from "../../../public/workflow-store/index.json";
import gmailLogin from "../../../public/workflow-store/workflows/gmail-login.json";
import googleOneAi from "../../../public/workflow-store/workflows/google-one-ai.json";
import metaSessionWarm from "../../../public/workflow-store/workflows/meta-session-warm.json";
import stealthHealthProbe from "../../../public/workflow-store/workflows/stealth-health-probe.json";
import type { WorkflowStoreEntry, WorkflowStoreManifest } from "./workflow-store-types";

const BUNDLED_PAYLOADS: Record<string, Record<string, unknown>> = {
  "gmail-login": gmailLogin as Record<string, unknown>,
  "google-one-ai": googleOneAi as Record<string, unknown>,
  "meta-session-warm": metaSessionWarm as Record<string, unknown>,
  "stealth-health-probe": stealthHealthProbe as Record<string, unknown>,
};

export function readBundledDriveManifest(): WorkflowStoreManifest {
  return bundledManifest as WorkflowStoreManifest;
}

export function readBundledDrivePayload(id: string): Record<string, unknown> | undefined {
  return BUNDLED_PAYLOADS[id];
}

export function attachBundledDrivePayloads(entries: WorkflowStoreEntry[]): WorkflowStoreEntry[] {
  return entries.map((entry) => {
    if (entry.payload && typeof entry.payload === "object") return entry;
    const payload = BUNDLED_PAYLOADS[entry.id];
    return payload ? { ...entry, payload } : entry;
  });
}
