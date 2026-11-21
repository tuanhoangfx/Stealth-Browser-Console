import { useState } from "react";
import { LayoutGrid } from "lucide-react";
import { Glass } from "../../../../../theme/p0008";
import { MOBILE_FARM_PREVIEW_VARIANTS, type MobileFarmPreviewVariantId } from "./tokens";
import { V1SplitDockStage } from "./V1-SplitDockStage";
import { V2EqualFiveScreenGrid } from "./V2-EqualFiveScreenGrid";
import { V3HeroStageFilmstrip } from "./V3-HeroStageFilmstrip";
import { V4ExecutionLanesMatrix } from "./V4-ExecutionLanesMatrix";
import { V5CommandDeckProgressive } from "./V5-CommandDeckProgressive";
import "./mobile-farm-preview.css";

function resolveInitialVariant(): MobileFarmPreviewVariantId {
  try {
    const raw = new URLSearchParams(window.location.search).get("av")?.toUpperCase();
    if (raw === "V1" || raw === "V2" || raw === "V3" || raw === "V4" || raw === "V5") {
      return raw;
    }
  } catch {
    /* ignore SSR or restricted URL */
  }
  return "V1";
}

export function MobileFarm5DevicesDesignPreview() {
  const [variant, setVariant] = useState<MobileFarmPreviewVariantId>(resolveInitialVariant);
  const [lastPreviewFeedback, setLastPreviewFeedback] = useState<string>("");

  const activeMeta = MOBILE_FARM_PREVIEW_VARIANTS.find((v) => v.id === variant) || MOBILE_FARM_PREVIEW_VARIANTS[0];

  const handleSelectVariant = (id: MobileFarmPreviewVariantId) => {
    setVariant(id);
    setLastPreviewFeedback("");
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("dtpl", "mobile-farm-5devices");
      url.searchParams.set("av", id);
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* ignore URL sync error */
    }
  };

  return (
    <div className="space-y-3">
      <Glass tone="cyan">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
              <LayoutGrid className="h-3.5 w-3.5" />
              Design Preview 5 · P0003 Mobile Farm
            </div>
            <h2 className="mt-1 text-base font-semibold text-white">{activeMeta.name}</h2>
            <p className="mt-0.5 text-xs text-slate-300">
              <strong>Direction:</strong> {activeMeta.direction} — {activeMeta.summary}
            </p>
          </div>
          <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200">
            Reply <strong>&quot;Design: {variant}&quot;</strong> to lock and promote to Mobile Farm
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
          {MOBILE_FARM_PREVIEW_VARIANTS.map((v) => {
            const active = v.id === variant;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => handleSelectVariant(v.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-cyan-400/70 bg-cyan-500/20 text-white"
                    : "border-white/15 bg-black/30 text-slate-300 hover:bg-white/10"
                }`}
              >
                {v.name}
              </button>
            );
          })}
          {lastPreviewFeedback ? (
            <span className="ml-auto rounded border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-200">
              {lastPreviewFeedback}
            </span>
          ) : null}
        </div>
      </Glass>

      {variant === "V1" ? <V1SplitDockStage onAction={setLastPreviewFeedback} /> : null}
      {variant === "V2" ? <V2EqualFiveScreenGrid onAction={setLastPreviewFeedback} /> : null}
      {variant === "V3" ? <V3HeroStageFilmstrip onAction={setLastPreviewFeedback} /> : null}
      {variant === "V4" ? <V4ExecutionLanesMatrix onAction={setLastPreviewFeedback} /> : null}
      {variant === "V5" ? <V5CommandDeckProgressive onAction={setLastPreviewFeedback} /> : null}
    </div>
  );
}
