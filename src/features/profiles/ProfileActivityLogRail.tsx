import { useMemo } from "react";
import { HubToolDetailRail } from "@tool-workspace/hub-ui";
import type { RunLogEntry } from "../../types";
import { PROFILE_MODAL_SECTION_STICKER } from "../../lib/profile-form-stickers";
import { StealthConsoleContent } from "../runtime/StealthRuntimeRailPanels";
import { StealthConsoleRailTitle } from "../runtime/stealth-console-hint";
import { PROFILE_DETAIL_SECTION_LOG } from "./profile-detail-toc";
import type { ProfileConsoleLine } from "./profile-run-log";

function toConsoleLogs(lines: ProfileConsoleLine[]) {
  return lines.map((line) => ({
    id: line.id,
    level: (line.level === "success" || line.level === "failed" || line.level === "running"
      ? "info"
      : line.level) as RunLogEntry["level"],
    source: line.source,
    message: line.message,
    time: line.time,
  }));
}

/** Create/bulk modal console rail — Console SSOT (no channel legend row). */
export function ProfileActivityLogRail({
  lines,
  emptyHint,
  focused = false,
}: {
  lines: ProfileConsoleLine[];
  emptyHint: string;
  focused?: boolean;
}) {
  const consoleLogs = useMemo(() => toConsoleLogs(lines), [lines]);

  return (
    <HubToolDetailRail
      id={PROFILE_DETAIL_SECTION_LOG}
      title={<StealthConsoleRailTitle />}
      titleEmoji={PROFILE_MODAL_SECTION_STICKER.console}
      className={`twofa-adm-rail--log hub-adm-rail--log stealth-profile-detail-log-rail${
        focused ? " stealth-profile-detail-log-rail--focused" : ""
      }`}
      ariaLabel="Console"
    >
      <StealthConsoleContent logs={consoleLogs} emptyHint={emptyHint} />
    </HubToolDetailRail>
  );
}
