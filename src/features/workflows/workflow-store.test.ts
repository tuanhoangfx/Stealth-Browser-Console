import { afterEach, describe, expect, it, vi } from "vitest";
import { mergeInstalledWorkflow, normalizeImportedWorkflow, resolveUniqueWorkflowId } from "./workflow-import-utils";
import { filterWorkflowStoreEntries } from "./workflow-store-filters";
import { mergeWorkflowStoreEntries } from "./workflow-store-merge";
import { workflowStoreUpdatedMs } from "./workflow-store-meta";
import type { WorkflowStoreEntry } from "./workflow-store-types";

describe("resolveUniqueWorkflowId", () => {
  it("suffixes when id already taken", () => {
    expect(resolveUniqueWorkflowId(["gmail-login", "gmail-login-2"], "gmail-login")).toBe("gmail-login-3");
  });
});

describe("normalizeImportedWorkflow", () => {
  it("hydrates steps and defaults", () => {
    const workflow = normalizeImportedWorkflow({
      id: "demo",
      name: "Demo",
      targetUrl: "https://example.com",
      steps: [{ id: "s1", kind: "navigate", value: "https://example.com", enabled: true, timeoutMs: 5000 }],
    });
    expect(workflow.id).toBe("demo");
    expect(workflow.steps.length).toBeGreaterThan(0);
    expect(workflow.action).toBe("open-url");
  });
});

describe("mergeInstalledWorkflow", () => {
  it("appends with unique id when not replacing", () => {
    const base = normalizeImportedWorkflow({ id: "a", name: "A", targetUrl: "https://a.test" });
    const incoming = normalizeImportedWorkflow({ id: "a", name: "A2", targetUrl: "https://b.test" });
    const next = mergeInstalledWorkflow([base], incoming);
    expect(next).toHaveLength(2);
    expect(next[1]?.id).toBe("a-2");
  });
});

describe("mergeWorkflowStoreEntries", () => {
  it("prefers supabase over drive for same id", () => {
    const drive: WorkflowStoreEntry = {
      id: "gmail-login",
      name: "Drive copy",
      description: "",
      version: "1.0.0",
      platform: "Google",
      group: "Core",
      source: "drive",
      sortOrder: 1,
    };
    const supabase: WorkflowStoreEntry = {
      id: "gmail-login",
      name: "Supabase copy",
      description: "",
      version: "1.0.1",
      platform: "Google",
      group: "Core",
      source: "supabase",
      sortOrder: 1,
    };
    const merged = mergeWorkflowStoreEntries([[drive], [supabase]]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.name).toBe("Supabase copy");
  });
});

describe("filterWorkflowStoreEntries", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const sample: WorkflowStoreEntry[] = [
    {
      id: "a",
      name: "Alpha",
      description: "",
      version: "1.0.0",
      platform: "Google",
      group: "Core",
      source: "supabase",
      sortOrder: 1,
    },
    {
      id: "b",
      name: "Beta",
      description: "",
      version: "1.0.0",
      platform: "GitHub",
      group: "Check",
      source: "drive",
      sortOrder: 2,
    },
  ];

  it("filters by platform and source", () => {
    expect(filterWorkflowStoreEntries(sample, "", [], ["Google"], [], "all")).toHaveLength(1);
    expect(filterWorkflowStoreEntries(sample, "", [], [], ["drive"], "all")).toHaveLength(1);
  });

  it("uses createdAt for period even when updated later", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T00:00:00.000Z"));
    const entries = [
      {
        ...sample[0]!,
        createdAt: "2024-03-10T00:00:00.000Z",
        updatedAt: "2026-07-17T00:00:00.000Z",
      },
      {
        ...sample[1]!,
        createdAt: "2026-03-10T00:00:00.000Z",
        updatedAt: "2024-07-17T00:00:00.000Z",
      },
    ];

    expect(filterWorkflowStoreEntries(entries, "", [], [], [], "1y").map((entry) => entry.id)).toEqual([
      "b",
    ]);
  });
});

describe("workflowStoreUpdatedMs", () => {
  it("parses ISO updatedAt", () => {
    const ms = workflowStoreUpdatedMs({
      id: "x",
      name: "X",
      description: "",
      version: "1",
      platform: "Generic",
      group: "Core",
      source: "drive",
      sortOrder: 0,
      updatedAt: "2026-07-04T12:00:00.000Z",
    });
    expect(ms).toBe(Date.parse("2026-07-04T12:00:00.000Z"));
  });
});

describe("workflowStoreSourceBrand", () => {
  it("maps catalog sources to hub brand ids", async () => {
    const { WORKFLOW_STORE_SOURCE_BRAND_ID, workflowStoreSourceLabel } = await import(
      "./workflow-store-source-brand"
    );
    expect(WORKFLOW_STORE_SOURCE_BRAND_ID.supabase).toBe("supabase");
    expect(WORKFLOW_STORE_SOURCE_BRAND_ID.drive).toBe("google-drive");
    expect(workflowStoreSourceLabel("supabase")).toBe("Supabase");
    expect(workflowStoreSourceLabel("drive")).toBe("Drive");
  });
});
