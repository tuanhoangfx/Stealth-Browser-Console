import { Loader2, Rocket } from "lucide-react";
import type { AutomationLaunchProgress } from "../runtime/useStealthAutomationQueue";

/** Profiles hub header center — replaces default stats while Launch batch is running. */
export function StealthProfilesLaunchHeaderBand({ progress }: { progress: AutomationLaunchProgress }) {
  const { completed, total, active, failed, workflowName, concurrency, workflowIndex, workflowCount } = progress;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const workflowSuffix =
    workflowCount > 1 ? ` · workflow ${workflowIndex + 1}/${workflowCount}` : "";

  return (
    <div
      className="inline-flex min-w-0 max-w-full flex-col gap-1.5 py-0.5"
      role="status"
      aria-live="polite"
      aria-label={`Launching ${workflowName}: ${completed} of ${total} profiles complete`}
    >
      <div className="inline-flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        <span className="inline-flex items-center gap-1.5 font-medium text-amber-200/95">
          <Rocket size={14} className="shrink-0 text-amber-300" aria-hidden />
          Launch
        </span>
        <span className="truncate text-[var(--text)]/90" title={workflowName}>
          {workflowName}
          {workflowSuffix}
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums text-[var(--text)]/85">
          <Loader2 size={13} className="shrink-0 animate-spin text-amber-300/90" aria-hidden />
          {completed}/{total}
        </span>
        {active > 0 ? (
          <span className="tabular-nums text-indigo-200/90" title="Profiles running in parallel">
            {active} active
            {concurrency > 1 ? ` · ×${concurrency}` : ""}
          </span>
        ) : null}
        {failed > 0 ? (
          <span className="tabular-nums text-rose-300/90">{failed} failed</span>
        ) : null}
      </div>
      <div
        className="h-1 w-full min-w-[8rem] max-w-[18rem] overflow-hidden rounded-full bg-white/[.06]"
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400/85 to-indigo-400/85 transition-[width] duration-300 ease-out"
          style={{ width: `${Math.max(pct, active > 0 ? 8 : 0)}%` }}
        />
      </div>
    </div>
  );
}
