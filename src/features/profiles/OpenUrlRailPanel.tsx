import { HubPanel } from "@tool-workspace/hub-ui";
import { Play } from "lucide-react";
import { useState } from "react";
import { FINGERPRINT_CHECK_SITES } from "../../lib/stealth-fingerprint-checks";
import { useProfilesRuntime } from "../../providers/ProfilesRuntimeProvider";
import { useWorkflowRuntime } from "../../context/workflow-runtime-context";
import type { ProfileRow } from "../../types";

export function OpenUrlRailPanel({ selectedProfiles }: { selectedProfiles: ProfileRow[] }) {
  const { runOpenUrl } = useProfilesRuntime();
  const { automationRunning } = useWorkflowRuntime();
  const [targetUrl, setTargetUrl] = useState(FINGERPRINT_CHECK_SITES[0]!.url);
  const [screenshot, setScreenshot] = useState(true);
  const [closeWhenDone, setCloseWhenDone] = useState(false);

  const runCurrent = () =>
    void runOpenUrl(selectedProfiles, {
      targetUrl: targetUrl.trim(),
      screenshot,
      closeWhenDone
    });

  const runAllChecks = () =>
    void (async () => {
      const batch = selectedProfiles.slice(0, 1);
      for (let i = 0; i < FINGERPRINT_CHECK_SITES.length; i += 1) {
        const site = FINGERPRINT_CHECK_SITES[i]!;
        await runOpenUrl(batch, {
          targetUrl: site.url,
          screenshot: true,
          closeWhenDone: i === FINGERPRINT_CHECK_SITES.length - 1 && closeWhenDone
        });
      }
    })();

  return (
    <HubPanel title="Open URL" desc="Run on selected profiles" actions={<Play size={16} className="text-violet-300" />}>
      <div className="hub-panel-fields">
        <label>Target URL</label>
        <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://example.com" />
        <div className="stealth-fingerprint-presets">
          {FINGERPRINT_CHECK_SITES.map((site) => (
            <button
              key={site.id}
              type="button"
              className="hub-btn"
              title={site.hint}
              onClick={() => setTargetUrl(site.url)}
            >
              {site.label}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={screenshot} onChange={(e) => setScreenshot(e.target.checked)} />
          Screenshot
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={closeWhenDone} onChange={(e) => setCloseWhenDone(e.target.checked)} />
          Close when done
        </label>
        <button
          type="button"
          className="primary"
          disabled={!selectedProfiles.length || automationRunning}
          onClick={runCurrent}
        >
          Run on {selectedProfiles.length || 0} profile(s)
        </button>
        <button
          type="button"
          className="hub-btn"
          disabled={!selectedProfiles.length || automationRunning}
          onClick={runAllChecks}
        >
          Run all fingerprint checks
        </button>
      </div>
    </HubPanel>
  );
}
