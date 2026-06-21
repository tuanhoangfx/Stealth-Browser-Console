const MAX_ENTRIES = 48;
/** @type {Array<{ profileId: string; profileName: string; label: string; totalMs: number; marks: Array<{ phase: string; ms: number }>; at: string }>} */
const entries = [];

function recordLaunchPerf(payload) {
  if (!payload || !payload.profileId) return;
  entries.unshift({
    profileId: String(payload.profileId),
    profileName: String(payload.profileName || ""),
    label: String(payload.label || "openProfile"),
    totalMs: Number(payload.totalMs) || 0,
    marks: Array.isArray(payload.marks) ? payload.marks : [],
    at: new Date().toISOString(),
  });
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
}

function listLaunchPerf(limit = 24) {
  const lim = Math.min(MAX_ENTRIES, Math.max(1, Number(limit) || 24));
  return entries.slice(0, lim);
}

function clearLaunchPerf() {
  entries.length = 0;
  return { ok: true };
}

module.exports = { recordLaunchPerf, listLaunchPerf, clearLaunchPerf };
