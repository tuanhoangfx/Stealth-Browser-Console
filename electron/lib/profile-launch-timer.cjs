const { isIdentityDebugEnabled } = require("./app-settings.cjs");

function createLaunchTimer(profileId) {
  const started = Date.now();
  const marks = [];

  function mark(phase, extra) {
    marks.push({
      phase,
      ms: Date.now() - started,
      ...(extra !== undefined ? { extra } : {}),
    });
  }

  function flush(label = "done") {
    if (!isIdentityDebugEnabled()) return;
    const total = Date.now() - started;
    console.log(`[launch-timer] profile=${profileId} ${label} total=${total}ms`, marks);
  }

  return { mark, flush, started };
}

module.exports = { createLaunchTimer };
