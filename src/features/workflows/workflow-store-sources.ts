import { getIdentitySupabase } from "../../lib/supabase-identity";
import { isHubSupabaseConfigured } from "../../lib/hub-supabase-env";
import { WORKFLOW_STORE_DRIVE_MANIFEST_URL, WORKFLOW_STORE_INSTALLED_KEY } from "./workflow-store-config";
import { mergeWorkflowStoreEntries } from "./workflow-store-merge";
import type { WorkflowStoreEntry, WorkflowStoreLoadResult, WorkflowStoreManifest } from "./workflow-store-types";

function rowToEntry(row: Record<string, unknown>): WorkflowStoreEntry | null {
  const id = String(row.id || "").trim();
  if (!id) return null;
  const payload = row.payload;
  return {
    id,
    name: String(row.name || id),
    description: String(row.description || ""),
    version: String(row.version || "1.0.0"),
    platform: String(row.platform || "Generic"),
    group: String(row.workflow_group || row.group || "Core"),
    source: "supabase",
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
    payload: payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : undefined,
  };
}

export async function fetchSupabaseWorkflowCatalog(): Promise<{ entries: WorkflowStoreEntry[]; error?: string }> {
  if (!isHubSupabaseConfigured) {
    return { entries: [], error: "Hub Supabase not configured" };
  }
  try {
    const supabase = getIdentitySupabase();
    if (!supabase) return { entries: [], error: "Hub Supabase client unavailable" };
    const { data, error } = await supabase
      .from("stealth_workflow_catalog")
      .select("id,name,description,version,platform,workflow_group,source,payload,sort_order,created_at,updated_at")
      .eq("published", true)
      .order("sort_order", { ascending: true });
    if (error) return { entries: [], error: error.message };
    const entries = (data || [])
      .map((row) => rowToEntry(row as Record<string, unknown>))
      .filter(Boolean) as WorkflowStoreEntry[];
    return { entries };
  } catch (err) {
    return { entries: [], error: err instanceof Error ? err.message : "Supabase catalog fetch failed" };
  }
}

function manifestToEntries(manifest: WorkflowStoreManifest): WorkflowStoreEntry[] {
  const manifestUpdatedAt = manifest.updatedAt;
  return (manifest.workflows || []).map((item, index) => ({
    ...item,
    source: item.source || "drive",
    sortOrder: item.sortOrder ?? index,
    updatedAt: item.updatedAt ?? manifestUpdatedAt,
  }));
}

export async function fetchDriveWorkflowManifest(
  manifestUrl = WORKFLOW_STORE_DRIVE_MANIFEST_URL,
): Promise<{ entries: WorkflowStoreEntry[]; error?: string }> {
  try {
    const response = await fetch(manifestUrl, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      return { entries: [], error: `Drive manifest HTTP ${response.status}` };
    }
    const manifest = (await response.json()) as WorkflowStoreManifest;
    if (!manifest || !Array.isArray(manifest.workflows)) {
      return { entries: [], error: "Drive manifest invalid" };
    }
    return { entries: manifestToEntries(manifest) };
  } catch (err) {
    return { entries: [], error: err instanceof Error ? err.message : "Drive manifest fetch failed" };
  }
}

export async function fetchWorkflowStorePayload(entry: WorkflowStoreEntry): Promise<Record<string, unknown>> {
  if (entry.payload && typeof entry.payload === "object") return entry.payload;
  if (!entry.payloadUrl) throw new Error("Workflow payload missing");
  const response = await fetch(entry.payloadUrl, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Workflow payload HTTP ${response.status}`);
  const data = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Workflow payload must be a JSON object");
  }
  return data as Record<string, unknown>;
}

export async function loadWorkflowStoreCatalog(): Promise<WorkflowStoreLoadResult> {
  const errors: string[] = [];
  const [supabaseResult, driveResult] = await Promise.all([
    fetchSupabaseWorkflowCatalog(),
    fetchDriveWorkflowManifest(),
  ]);
  if (supabaseResult.error) errors.push(`Supabase: ${supabaseResult.error}`);
  if (driveResult.error) errors.push(`Drive: ${driveResult.error}`);
  const entries = mergeWorkflowStoreEntries([supabaseResult.entries, driveResult.entries]);
  return {
    entries,
    errors,
    loadedSupabase: supabaseResult.entries.length > 0,
    loadedDrive: driveResult.entries.length > 0,
  };
}

export function readInstalledStoreIds(): Set<string> {
  try {
    const raw = localStorage.getItem(WORKFLOW_STORE_INSTALLED_KEY);
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((id) => String(id)));
  } catch {
    return new Set();
  }
}

export function markStoreWorkflowInstalled(id: string) {
  const installed = readInstalledStoreIds();
  installed.add(id);
  localStorage.setItem(WORKFLOW_STORE_INSTALLED_KEY, JSON.stringify(Array.from(installed)));
}
