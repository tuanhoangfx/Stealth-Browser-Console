/** Chrome “Search Tabs”–style quick picker — find workflow and run on open profiles. */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Search } from "lucide-react";
import { useProfilesRuntime } from "../../providers/ProfilesRuntimeProvider";
import { useWorkflowRuntime } from "../../context/workflow-runtime-context";
import { useWorkflowPicker } from "../../context/workflow-picker-context";
import {
  workflowDisplayId,
  workflowDisplayPlatform,
  workflowPlatformIconFor,
  workflowPlatformSvgUrl,
  workflowPlatformTone,
} from "./workflow-display";
import type { WorkflowConfig } from "./workflow-types";
import type { ProfileRow } from "../../types";

function isOpenProfile(profile: ProfileRow) {
  return profile.status === "running" || profile.status === "opening";
}

function resolveQuickRunTargets(all: ProfileRow[], selected: ProfileRow[]) {
  const openSelected = selected.filter(isOpenProfile);
  if (openSelected.length) return openSelected;
  return all.filter(isOpenProfile);
}

function matchWorkflow(workflow: WorkflowConfig, query: string, defaultWorkflows: WorkflowConfig[]) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const id = workflowDisplayId(workflow.id, defaultWorkflows).toLowerCase();
  return (
    workflow.name.toLowerCase().includes(q) ||
    id.includes(q) ||
    workflowDisplayPlatform(workflow).toLowerCase().includes(q)
  );
}

export const WorkflowQuickRunButton = memo(function WorkflowQuickRunButton() {
  const { profiles, selectedProfiles } = useProfilesRuntime();
  const { automationRunning, runWorkflowOnOpenProfiles } = useWorkflowRuntime();
  const { workflowConfigs, builtinWorkflows } = useWorkflowPicker();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const openTargets = useMemo(
    () => resolveQuickRunTargets(profiles, selectedProfiles),
    [profiles, selectedProfiles],
  );

  const filtered = useMemo(
    () => workflowConfigs.filter((wf) => matchWorkflow(wf, query, builtinWorkflows)).slice(0, 8),
    [builtinWorkflows, query, workflowConfigs],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  useEffect(() => {
    const onHotkey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "w") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", onHotkey);
    return () => document.removeEventListener("keydown", onHotkey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [close, open]);

  const handleRun = useCallback(
    (workflowId: string) => {
      close();
      void runWorkflowOnOpenProfiles(workflowId);
    },
    [close, runWorkflowOnOpenProfiles],
  );

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className="hub-btn hub-btn--ghost inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
        title="Quick run workflow on open profiles (Ctrl+Shift+W)"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={automationRunning}
        onClick={() => setOpen((value) => !value)}
      >
        <Play size={14} className="shrink-0" aria-hidden />
        <span className="hidden sm:inline">Quick run</span>
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Quick run workflow"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-white/10 bg-[var(--panel)] shadow-xl shadow-black/40"
        >
          <div className="border-b border-white/5 px-3 py-2">
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5">
              <Search size={14} className="shrink-0 text-[var(--muted)]" aria-hidden />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search workflows to run…"
                className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
              />
              <kbd className="hidden rounded border border-white/10 px-1 text-[10px] text-[var(--muted)] lg:inline">
                Ctrl+Shift+W
              </kbd>
            </div>
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              {openTargets.length > 0
                ? `${openTargets.length} open profile${openTargets.length === 1 ? "" : "s"} — pick a workflow to run now.`
                : "No open profiles — launch a profile first."}
            </p>
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.map((workflow) => {
              const platform = workflowDisplayPlatform(workflow);
              const PlatformIcon = workflowPlatformIconFor(platform);
              const platformSvgUrl = workflowPlatformSvgUrl(platform);
              const disabled = openTargets.length === 0 || automationRunning;
              return (
                <li key={workflow.id}>
                  <button
                    type="button"
                    role="option"
                    disabled={disabled}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={() => handleRun(workflow.id)}
                  >
                    <span
                      className={`hub-directory-icon-cell__icon shrink-0 ${workflowPlatformTone(platform)}`}
                      aria-hidden
                    >
                      {platformSvgUrl ? (
                        <img src={platformSvgUrl} alt="" className="hub-directory-icon-cell__img" />
                      ) : PlatformIcon ? (
                        <PlatformIcon size={14} strokeWidth={2.25} />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-[var(--text)]">{workflow.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-[var(--muted)]">
                      {workflowDisplayId(workflow.id, builtinWorkflows)}
                    </span>
                  </button>
                </li>
              );
            })}
            {!filtered.length ? (
              <li className="px-3 py-4 text-center text-xs text-[var(--muted)]">No workflows match.</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
});
