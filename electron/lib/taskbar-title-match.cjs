/**
 * Window-title ↔ profile label match — SSOT for taskbar HWND fallback.
 * C# `StealthTaskbarWin.TitleMatchesLabel` in stealth-taskbar-apply-lib.ps1 must stay in sync.
 *
 * Burst-open often has pid=0 (sidecar late) while the page title is already "0010" / "0010 — …".
 * Matching the 4-digit code with a separator avoids "001" hitting "0010".
 */
function windowTitleMatchesProfileLabel(title, label) {
  const t = String(title || "");
  const l = String(label || "").trim();
  if (!t || !l) return false;
  if (t === l) return true;
  if (t.startsWith(`${l} —`) || t.startsWith(`${l} ·`) || t.startsWith(`${l} -`)) return true;
  const code = l.slice(0, 4);
  if (/^\d{4}$/.test(code) && code !== l) {
    if (t === code) return true;
    if (t.startsWith(`${code} —`) || t.startsWith(`${code} ·`) || t.startsWith(`${code} -`)) return true;
  }
  return false;
}

module.exports = { windowTitleMatchesProfileLabel };
