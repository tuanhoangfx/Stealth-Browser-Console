export type WorkflowStoreSource = "supabase" | "drive";

export type WorkflowStoreEntry = {
  id: string;
  name: string;
  description: string;
  version: string;
  platform: string;
  group: string;
  source: WorkflowStoreSource;
  sortOrder: number;
  /** ISO timestamp — creation-date SSOT for workspace period filters. */
  createdAt?: string;
  /** ISO timestamp — Supabase `updated_at` or Drive manifest `updatedAt`. */
  updatedAt?: string;
  /** Full workflow JSON when bundled (Supabase payload or inline Drive manifest). */
  payload?: Record<string, unknown>;
  /** Remote JSON URL for Drive-sourced workflows. */
  payloadUrl?: string;
};

export type WorkflowStoreManifest = {
  version: number;
  updatedAt?: string;
  workflows: WorkflowStoreEntry[];
};

export type WorkflowStoreLoadResult = {
  entries: WorkflowStoreEntry[];
  errors: string[];
  loadedSupabase: boolean;
  loadedDrive: boolean;
};
