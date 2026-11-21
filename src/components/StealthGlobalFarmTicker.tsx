import { memo, useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { fetchFarmApi, type MobileFarmExecutionBoardData } from "../views/mobile-farm/mobile-farm-stream";

/**
 * Compact cross-tab header badge mounted inside StealthTabHeaderActions so active Mobile Farm tasks
 * remain visible in AppTabHeader without adding a banner row above `<main>`.
 */
export const StealthGlobalFarmTicker = memo(function StealthGlobalFarmTicker({
  visible,
  onOpenMobileFarm,
}: {
  visible: boolean;
  onOpenMobileFarm: () => void;
}) {
  const [board, setBoard] = useState<MobileFarmExecutionBoardData | null>(null);

  useEffect(() => {
    if (!visible) return undefined;
    let alive = true;
    const pull = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = (await fetchFarmApi("/api/mobile-stealth/execution-board")) as MobileFarmExecutionBoardData;
        if (alive && res?.ok) setBoard(res);
      } catch {
        /* ignore background poll errors */
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), 15_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [visible]);

  const s = board?.summary;
  if (!visible || !board || !s || s.runningTasks <= 0) return null;
  const fb = board.tasks.find((t) => t.id === "fb-multi-method-100");
  const s9 = board.devices.find((d) => d.serial === "192.168.0.120:5555");
  const titleParts = [
    `Mobile Farm: ${s.runningTasks}/${s.totalTasks} running (${s.overallProgressPct}%)`,
    fb ? `FB ${fb.progressLabel} (${fb.percent}%)` : null,
    `Nodes ${s.onlineDevices}/${s.totalDevices}`,
    s9?.ok ? `S9+ ${s9.batteryLevel ?? "?"}% · ${s9.attachedDev || "AC"}` : null,
    "Click to open Mobile Farm",
  ].filter(Boolean);

  return (
    <button
      type="button"
      data-hub-chrome-bar="1"
      onClick={onOpenMobileFarm}
      title={titleParts.join(" · ")}
      className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-sky-400/35 bg-sky-950/55 px-2 text-[11px] font-medium text-sky-200 tabular-nums hover:bg-sky-900/65"
    >
      <Activity size={11} className="shrink-0 text-emerald-300" aria-hidden />
      <span>Farm {s.runningTasks}/{s.totalTasks}</span>
    </button>
  );
});
