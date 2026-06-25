/**
 * Boot loader safety — runs before main.tsx.
 * - Hides loader when app signals hub-boot-ready
 * - Surfaces module/runtime errors instead of infinite spinner / blank screen
 */
(function () {
  var BOOT_ID = "hub-boot-loader";
  var TIMEOUT_MS = 12000;

  window.__hubBootReady = false;

  function showBootError(message, detail) {
    var el = document.getElementById(BOOT_ID);
    if (!el) return;
    el.classList.remove("hub-boot-loader--pane");
    el.style.pointerEvents = "auto";
    el.setAttribute("role", "alert");
    el.setAttribute("aria-label", "App failed to load");
    el.innerHTML =
      '<div style="max-width:32rem;padding:1.5rem;text-align:center;font-family:Inter,system-ui,sans-serif;color:#e8ecff">' +
      '<p style="margin:0 0 0.5rem;font-size:0.95rem;font-weight:600">App failed to load</p>' +
      '<p style="margin:0 0 0.75rem;font-size:0.75rem;line-height:1.5;color:#94a3b8">' +
      (message || "JavaScript did not start.") +
      "</p>" +
      (detail
        ? '<pre style="margin:0 0 1rem;padding:0.75rem;border-radius:0.5rem;background:rgba(15,23,42,0.85);color:#fca5a5;font:11px/1.45 ui-monospace,Consolas,monospace;text-align:left;white-space:pre-wrap;word-break:break-word;max-height:8rem;overflow:auto">' +
          detail +
          "</pre>"
        : "") +
      '<p style="margin:0 0 1rem;font-size:0.7rem;color:#64748b">Try hard refresh <kbd style="padding:0.1rem 0.35rem;border-radius:0.25rem;background:rgba(99,102,241,0.2);color:#a5b4fc">Ctrl+Shift+R</kbd> or restart dev server.</p>' +
      '<button type="button" onclick="location.reload()" style="cursor:pointer;border:1px solid rgba(129,140,248,0.4);border-radius:0.5rem;background:rgba(99,102,241,0.15);color:#c7d2fe;padding:0.45rem 1rem;font-size:0.75rem">Reload</button>' +
      "</div>";
  }

  window.addEventListener("hub-boot-ready", function () {
    window.__hubBootReady = true;
    var el = document.getElementById(BOOT_ID);
    if (el) el.remove();
  });

  window.addEventListener("error", function (event) {
    if (window.__hubBootReady) return;
    var msg = event.message || "Script error";
    var detail = event.filename ? event.filename + ":" + (event.lineno || "?") : "";
    showBootError(msg, detail);
  });

  window.addEventListener("unhandledrejection", function (event) {
    if (window.__hubBootReady) return;
    var reason = event.reason;
    var msg = reason && reason.message ? reason.message : String(reason || "Unhandled promise rejection");
    showBootError(msg);
  });

  window.setTimeout(function () {
    if (window.__hubBootReady) return;
    var hungHint =
      "Hung Vite zombie or stale cache. In the tool folder run:\n" +
      "  pnpm dev:recover\n" +
      "If recover fails (Access Denied), in PowerShell:\n" +
      "  tskill <PID> /A\n" +
      "  (find PID: netstat -ano | findstr :5186)";
    showBootError("JavaScript did not start in time.", hungHint);
  }, TIMEOUT_MS);
})();
