/**
 * Boot loader safety — runs before main.tsx.
 * - Hides loader when app signals hub-boot-ready
 * - Surfaces module/runtime errors instead of infinite spinner / blank screen
 * - Cold Vite prebundle: probe deps + early server-offline / hung-prebundle hints
 */
(function () {
  var BOOT_ID = "hub-boot-loader";
  var SERVER_PROBE_MS = 2000;
  var PREBUNDLE_HINT_MS = 28000;
  var FINAL_TIMEOUT_MS = 120000;
  var DEP_PROBE_INTERVAL_MS = 15000;
  var DEP_PROBE_TIMEOUT_MS = 10000;
  var DEP_PROBE_FAIL_LIMIT = 2;

  window.__hubBootReady = false;
  var depProbeFails = 0;
  var hungShown = false;

  // Every diagnostic below this line is about a local Vite dev server: it probes
  // /@vite/client and /node_modules/.vite/deps/react.js, and its hints tell you to run
  // pnpm dev:recover or tskill a PID. On a deployed static host none of that exists, so a
  // merely slow boot used to show visitors "Vite is preparing modules after a cold start"
  // plus PowerShell instructions, and then poll a 404 every 15s forever.
  var IS_DEV_HOST = (function () {
    var h = window.location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost");
  })();

  function getLoaderEl() {
    return document.getElementById(BOOT_ID);
  }

  /**
   * The app mounted, whatever the boot-ready signal says. A tool opened in a background tab
   * mounts normally but its rAF-scheduled hideBootLoader() never runs, so every timer below
   * used to keep firing against a working app — ending on a full-screen "did not finish
   * loading" error on top of rendered content. Rendered children are the ground truth.
   */
  function appHasRendered() {
    var root = document.getElementById("root");
    return !!root && root.childElementCount > 0;
  }

  function bootSettled() {
    if (window.__hubBootReady) return true;
    if (!appHasRendered()) return false;
    window.__hubBootReady = true;
    var el = getLoaderEl();
    if (el) el.remove();
    return true;
  }

  function showBootWaiting(message, submessage) {
    var el = getLoaderEl();
    if (!el || window.__hubBootReady) return;
    el.classList.add("hub-boot-loader--pane");
    el.style.pointerEvents = "none";
    el.setAttribute("role", "status");
    el.setAttribute("aria-label", message || "Loading");
    var existing = el.querySelector(".hub-boot-wait-text");
    if (!existing) {
      existing = document.createElement("p");
      existing.className = "hub-boot-wait-text";
      existing.style.cssText =
        "margin:0.75rem 0 0;font-size:0.75rem;line-height:1.5;color:#94a3b8;font-family:Inter,system-ui,sans-serif;text-align:center;max-width:20rem";
      el.appendChild(existing);
    }
    existing.textContent = submessage || message;
  }

  function showBootError(message, detail) {
    var el = getLoaderEl();
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
        ? '<pre style="margin:0 0 1rem;padding:0.75rem;border-radius:0.5rem;background:rgba(15,23,42,0.85);color:#fca5a5;font:11px/1.45 ui-monospace,Consolas,monospace;text-align:left;white-space:pre-wrap;word-break:break-word;max-height:10rem;overflow:auto">' +
          detail +
          "</pre>"
        : "") +
      '<p style="margin:0 0 1rem;font-size:0.7rem;color:#64748b">Try hard refresh <kbd style="padding:0.1rem 0.35rem;border-radius:0.25rem;background:rgba(99,102,241,0.2);color:#a5b4fc">Ctrl+Shift+R</kbd> or restart dev server.</p>' +
      '<button type="button" onclick="location.reload()" style="cursor:pointer;border:1px solid rgba(129,140,248,0.4);border-radius:0.5rem;background:rgba(99,102,241,0.15);color:#c7d2fe;padding:0.45rem 1rem;font-size:0.75rem">Reload</button>' +
      "</div>";
  }

  function fetchProbe(url, timeoutMs) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = window.setTimeout(function () {
        if (done) return;
        done = true;
        resolve({ ok: false, reason: "timeout" });
      }, timeoutMs);
      fetch(url, { cache: "no-store" })
        .then(function (r) {
          if (done) return;
          done = true;
          window.clearTimeout(timer);
          resolve({ ok: r.ok, status: r.status });
        })
        .catch(function (e) {
          if (done) return;
          done = true;
          window.clearTimeout(timer);
          resolve({ ok: false, reason: e && e.message ? e.message : "network" });
        });
    });
  }

  function devRecoverHint(fallbackPort) {
    var metaPort = document.querySelector('meta[name="hub-dev-port"]');
    var metaFolder = document.querySelector('meta[name="hub-dev-folder"]');
    var port = (metaPort && metaPort.content) || fallbackPort || "5175";
    var folder = (metaFolder && metaFolder.content) || "the tool folder";
    return (
      "Nothing is serving http://127.0.0.1:" +
      port +
      "\nIn " +
      folder +
      " run:\n  pnpm dev:node\n  or pnpm dev:recover"
    );
  }

  function showHungPrebundleError() {
    if (bootSettled() || hungShown) return;
    hungShown = true;
    var port = window.location.port || "5175";
    showBootError(
      "Vite prebundle is hung or stale.",
      "react.js did not load in time. In the tool folder run:\n" +
        "  pnpm dev:recover\n" +
        "Or keep Vite alive with:\n" +
        "  pnpm dev:node\n" +
        "If recover fails (Access Denied), in PowerShell:\n" +
        "  tskill <PID> /A\n" +
        "  (find PID: netstat -ano | findstr :" +
        port +
        ")",
    );
  }

  function probeViteDeps() {
    if (bootSettled() || hungShown) return;
    fetchProbe("/node_modules/.vite/deps/react.js", DEP_PROBE_TIMEOUT_MS).then(function (r) {
      if (bootSettled() || hungShown) return;
      if (!r.ok) {
        depProbeFails += 1;
        if (depProbeFails >= DEP_PROBE_FAIL_LIMIT) {
          showHungPrebundleError();
          return;
        }
      } else {
        depProbeFails = 0;
      }
      if (!window.__hubBootReady && !hungShown) {
        window.setTimeout(probeViteDeps, DEP_PROBE_INTERVAL_MS);
      }
    });
  }

  window.addEventListener("hub-boot-ready", function () {
    window.__hubBootReady = true;
    var el = getLoaderEl();
    if (el) el.remove();
  });

  window.addEventListener("error", function (event) {
    if (bootSettled()) return;
    var msg = event.message || "Script error";
    var detail = event.filename ? event.filename + ":" + (event.lineno || "?") : "";
    showBootError(msg, detail);
  });

  window.addEventListener("unhandledrejection", function (event) {
    if (bootSettled()) return;
    var reason = event.reason;
    var msg = reason && reason.message ? reason.message : String(reason || "Unhandled promise rejection");
    showBootError(msg);
  });

  window.setTimeout(function () {
    if (bootSettled() || hungShown || !IS_DEV_HOST) return;
    fetchProbe("/@vite/client", 5000).then(function (r) {
      if (bootSettled() || hungShown || r.ok) return;
      var port = window.location.port || "PORT";
      var reason = String(r.reason || "");
      if (reason === "timeout" || /failed|refused|network/i.test(reason)) {
        hungShown = true;
        showBootError(
          "Dev server is not responding.",
          devRecoverHint(window.location.port),
        );
      }
    });
  }, SERVER_PROBE_MS);

  window.setTimeout(function () {
    if (bootSettled() || hungShown) return;
    if (!IS_DEV_HOST) {
      showBootWaiting("Still loading…", "The app is taking longer than usual to start.");
      return;
    }
    showBootWaiting(
      "Prebundling dependencies…",
      "Vite is preparing modules after a cold start — this may take 1–2 minutes.",
    );
    probeViteDeps();
  }, PREBUNDLE_HINT_MS);

  window.setTimeout(function () {
    if (bootSettled() || hungShown) return;
    if (!IS_DEV_HOST) {
      showBootError(
        "The app did not finish loading.",
        "Reload the page. If it keeps failing, check your connection or try again shortly.",
      );
      return;
    }
    var port = window.location.port || "PORT";
    var hungHint =
      devRecoverHint(port) +
      "\nIf recover fails (Access Denied), in PowerShell:\n" +
      "  tskill <PID> /A\n" +
      "  (find PID: netstat -ano | findstr :" +
      port +
      ")";
    showBootError("JavaScript did not start in time.", hungHint);
  }, FINAL_TIMEOUT_MS);
})();
