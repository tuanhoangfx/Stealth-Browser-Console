"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-deferred-route-test-"));
process.env.STEALTH_DEFERRED_QUEUE_FILE = path.join(tmpDir, "deferred-user-headed-queue.json");

const { buildDeferredQueueRoutes } = require("../routes/deferred-queue-routes.cjs");

test("deferred-queue HTTP routes round-trip (enqueue, 8xxx reject, reconcile, claim, complete)", () => {
  const headedSet = new Set(["0977"]);
  let lastStatus = 0;
  let lastJson = null;

  const routes = buildDeferredQueueRoutes({
    sessionManager: {
      listRunning: () =>
        [...headedSet].map((code) => ({
          id: `pid-${code}`,
          name: code,
          headless: false,
          shadowLane: false,
        })),
      isUserInteractiveSession: (id) => headedSet.has(String(id).replace(/^pid-/, "")),
    },
    profileService: {
      getProfile: (id) => {
        const clean = String(id).replace(/^pid-/, "");
        return /^\d{4}$/.test(clean) ? { id: `pid-${clean}`, name: clean } : null;
      },
      findProfileByName: (name) => (/^\d{4}$/.test(name) ? { id: `pid-${name}`, name } : null),
    },
    send: {
      json: (_res, code, body) => {
        lastStatus = code;
        lastJson = body;
      },
    },
  });

  const call = (method, urlPath, body = null) => {
    lastStatus = 0;
    lastJson = null;
    const u = new URL(urlPath, "http://127.0.0.1:6003");
    const route = routes.find((r) => r.method === method && r.pattern.test(u.pathname));
    assert.ok(route, `Missing route ${method} ${u.pathname}`);
    route.handler({
      req: { method, headers: {} },
      res: {},
      query: u.searchParams,
      params: u.pathname.match(route.pattern),
      body,
    });
    return { status: lastStatus, data: lastJson };
  };

  // Reject 8xxx with 403
  const r8001 = call("POST", "/api/automation/deferred-queue/enqueue", {
    code: "8001",
    taskType: "appeal-antigravity-tos",
  });
  assert.equal(r8001.status, 403);
  assert.equal(r8001.data.skippedCustomer8xxx, true);

  // Enqueue 0977 while headed -> pending_user_headed
  const rEnq = call("POST", "/api/automation/deferred-queue/enqueue", {
    code: "0977",
    account: "test@hotmail.com",
    taskType: "recover-gmail-2fa",
  });
  assert.equal(rEnq.status, 200);
  assert.equal(rEnq.data.item.status, "pending_user_headed");

  // User closes 0977 -> GET auto-reconciles to ready_for_retry
  headedSet.clear();
  const rGet = call("GET", "/api/automation/deferred-queue");
  assert.equal(rGet.status, 200);
  assert.equal(rGet.data.readyForRetryCount, 1);
  assert.equal(rGet.data.items[0].readyForAgentRetry, true);

  // Claim + Complete
  const rClaim = call("POST", "/api/automation/deferred-queue/claim", { owner: "test-worker" });
  assert.equal(rClaim.status, 200);
  assert.equal(rClaim.data.count, 1);

  const rDone = call("POST", "/api/automation/deferred-queue/complete", {
    id: rClaim.data.claimed[0].id,
    ok: true,
    outcome: "recovered",
  });
  assert.equal(rDone.status, 200);
  assert.equal(rDone.data.readyForRetryCount, 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
