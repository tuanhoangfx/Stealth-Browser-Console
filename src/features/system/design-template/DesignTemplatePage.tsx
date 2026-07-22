import { HubDesignTemplateEmpty } from "@tool-workspace/hub-ui";
import { Glass } from "../../../theme/p0008";
import {
  ACTIVE_DESIGN_COUNT,
  RUN_HISTORY_DESIGN_LOCK,
  TASKBAR_PROFILE_BADGE_DESIGN_LOCK,
  WORKFLOW_CANVAS_LAYOUT_DESIGN_LOCK,
} from "./design-registry";

export function DesignTemplatePage() {
  return (
    <div className="design-template-page space-y-4 px-3 pb-10 pt-3">
      <Glass tone="purple">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-purple-300">System</p>
          <h1 className="mt-1 text-xl font-semibold">Design Template</h1>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Active reviews: <strong className="text-cyan-200">{ACTIVE_DESIGN_COUNT}</strong>
          </p>
          <p className="mt-2 text-[11px] text-emerald-200/90">
            Run History locked <strong>Design {RUN_HISTORY_DESIGN_LOCK}</strong> — Chip lanes (2026-07-06).
          </p>
          <p className="mt-1 text-[11px] text-emerald-200/90">
            Workflow canvas locked <strong>Design {WORKFLOW_CANVAS_LAYOUT_DESIGN_LOCK}</strong> — Spaced bezier flow
            (2026-07-06).
          </p>
          <p className="mt-1 text-[11px] text-emerald-200/90">
            Taskbar profile badge locked <strong>Design {TASKBAR_PROFILE_BADGE_DESIGN_LOCK}</strong> — colored last3
            only (`v4-digits-only-spaced5`, +30% digit gap vs spaced4). 0xxx white; 1xxx sky cyan (#00c8ff); 2–9 vivid hues.
          </p>
        </div>
      </Glass>
      <HubDesignTemplateEmpty
        description={
          <>
            <strong className="text-cyan-200/90">Taskbar profile badge</strong> locked as{" "}
            <span className="font-mono text-cyan-200">Design {TASKBAR_PROFILE_BADGE_DESIGN_LOCK}</span> — Bold colored
            last3 on native Chromium icon (no background) — 0xxx white; 1–9 vivid hues.
          </>
        }
      />
    </div>
  );
}
