"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  inspectMv3ServiceWorkerFleetHealth,
  invalidateExtensionSwHealthCache,
  formatSwHealthShortBadge,
} = require("./extension-sw-health.cjs");

test("inspectMv3ServiceWorkerFleetHealth reports healthy vs needs-heal and skips 8xxx/9xxx profiles", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-sw-health-"));
  try {
    invalidateExtensionSwHealthCache();
    const mkProfile = (code, e0001Entry, e0002Entry) => {
      const pDir = path.join(root, "profiles", code, "Default");
      fs.mkdirSync(pDir, { recursive: true });
      const settings = {};
      if (e0001Entry) settings.ehlfggnaljhaehaaflmcojimgbolilcb = e0001Entry;
      if (e0002Entry) settings.ckalnmjdalpecadefcppeohmdgocgjlj = e0002Entry;
      fs.writeFileSync(path.join(pDir, "Preferences"), JSON.stringify({ extensions: { settings } }), "utf8");
      fs.writeFileSync(path.join(pDir, "Secure Preferences"), JSON.stringify({ extensions: { settings } }), "utf8");
    };

    // #0004: healthy on v1.2.30 (E0001) & v0.1.0 (E0002)
    mkProfile(
      "0004",
      {
        state: 1,
        manifest: { name: "E0001 Cookie Bridge", version: "1.2.30" },
        service_worker_registration_info: { version: "1.2.30" },
        serviceworkerevents: ["runtime.onInstalled"],
      },
      {
        state: 1,
        manifest: { name: "E0002 Browser Operator", version: "0.1.0" },
        service_worker_registration_info: { version: "0.1.0" },
        serviceworkerevents: ["runtime.onStartup"],
      },
    );

    // #0007: E0001 missing SW registration (sandbox/junction failure), E0002 healthy
    mkProfile(
      "0007",
      {
        state: 1,
        manifest: { name: "E0001 Cookie Bridge", version: "1.2.28" },
        serviceworkerevents: [],
      },
      {
        state: 1,
        manifest: { name: "E0002 Browser Operator", version: "0.1.0" },
        service_worker_registration_info: { version: "0.1.0" },
        serviceworkerevents: ["runtime.onStartup"],
      },
    );

    // #8003 (Customer) and #9995 (Agent Smoke) MUST be ignored even if broken
    for (const ignored of ["8003", "9995"]) {
      mkProfile(
        ignored,
        { state: 1, manifest: { name: "E0001 Cookie Bridge", version: "1.0.0" }, serviceworkerevents: [] },
        { state: 1, manifest: { name: "E0002 Browser Operator", version: "0.1.0" }, serviceworkerevents: [] },
      );
    }

    // #10037 (Headless-only session: pre-pinned in `Preferences`, no `Secure Preferences` extension load) MUST NOT false-flag
    const headlessDir = path.join(root, "profiles", "10037", "Default");
    fs.mkdirSync(headlessDir, { recursive: true });
    fs.writeFileSync(
      path.join(headlessDir, "Preferences"),
      JSON.stringify({
        extensions: {
          settings: {
            ehlfggnaljhaehaaflmcojimgbolilcb: {
              state: 1,
              location: 4,
              manifest: { name: "E0001 Cookie Bridge", version: "1.2.30" },
            },
          },
        },
      }),
      "utf8",
    );

    const res = inspectMv3ServiceWorkerFleetHealth(root, {
      expectedE0001Version: "1.2.30",
      expectedE0002Version: "0.1.0",
      forceRefresh: true,
    });

    assert.equal(res.e0001.sampledProfiles, 2);
    assert.equal(res.e0001.registeredCount, 1);
    assert.equal(res.e0001.missingSwCount, 1);
    assert.equal(res.e0001.status, "needs-heal");
    assert.deepEqual(res.e0001.sampleMissingCodes, ["#0007"]);
    assert.equal(formatSwHealthShortBadge(res.e0001), " · SW 1 heal (1/2)");

    assert.equal(res.e0002.sampledProfiles, 2);
    assert.equal(res.e0002.registeredCount, 2);
    assert.equal(res.e0002.missingSwCount, 0);
    assert.equal(res.e0002.status, "healthy");
    assert.equal(formatSwHealthShortBadge(res.e0002), " · SW 2/2 OK");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
