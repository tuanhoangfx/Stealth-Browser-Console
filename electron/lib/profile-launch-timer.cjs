const { isIdentityDebugEnabled } = require("./app-settings.cjs");
const { recordLaunchPerf } = require("./profile-launch-perf.cjs");

function createLaunchTimer(profileId, profileName = "") {
  const started = Date.now();
  const marks = [];

  function mark(phase, extra) {
    marks.push({
      phase,
      ms: Date.now() - started,
      ...(extra !== undefined ? { extra } : {}),
    });
  }

  function flush(label = "done", meta = {}) {
    const total = Date.now() - started;
    const snapshot = marks.map(({ phase, ms }) => ({ phase, ms }));
    recordLaunchPerf({
      profileId,
      profileName: meta.profileName || profileName,
      label,
      totalMs: total,
      marks: snapshot,
    });
    if (!isIdentityDebugEnabled()) return;
    console.log(`[launch-timer] profile=${profileId} ${label} total=${total}ms`, marks);
  }

  return { mark, flush, started };
}

module.exports = { createLaunchTimer };
