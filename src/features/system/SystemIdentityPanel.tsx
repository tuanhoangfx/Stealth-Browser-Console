import { useCallback, useEffect, useState } from "react";
import { Glass } from "../../theme/p0008";
import { fetchIdentityDebugEnabled, setIdentityDebugEnabled } from "../../api";

/** System → Profile identity runtime toggles (persisted in app DB). */
export function SystemIdentityPanel() {
  const [debug, setDebug] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancel = false;
    fetchIdentityDebugEnabled()
      .then((enabled) => {
        if (!cancel) setDebug(enabled);
      })
      .catch((err) => {
        if (!cancel) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancel) setBusy(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const onToggle = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const next = await setIdentityDebugEnabled(!debug);
      setDebug(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [debug]);

  return (
    <Glass tone="cyan">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Profile identity</p>
          <h2 className="mt-1 text-sm font-semibold text-[var(--text)]">Taskbar debug logging</h2>
          <p className="mt-1 max-w-xl text-xs text-[var(--muted)]">
            Persisted setting — logs <code className="text-cyan-200/90">[identity-taskbar]</code> and PowerShell
            diagnostics on each launch. Env <code className="text-cyan-200/90">STEALTH_IDENTITY_DEBUG=1</code> still
            overrides.
          </p>
          {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[var(--text)]">
          <input
            type="checkbox"
            className="hub-checkbox"
            checked={debug}
            disabled={busy}
            onChange={() => void onToggle()}
          />
          Enable debug
        </label>
      </div>
    </Glass>
  );
}
