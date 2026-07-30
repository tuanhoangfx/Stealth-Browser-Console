"use strict";
/** Smoke test thuáº§n Node cho auth gate, job queue vÃ  route registry (khÃ´ng cáº§n Electron). */
const assert = require("node:assert");

const { checkAuth } = require("./lib/api-auth.cjs");
const { JobQueue } = require("./lib/job-queue.cjs");
const { buildRoutes } = require("./api-routes.cjs");

let failures = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`  âœ“ ${name}`))
    .catch((err) => {
      failures += 1;
      console.error(`  âœ— ${name}: ${err.message}`);
    });
}

(async () => {
  console.log("api-auth:");
  await test("má»Ÿ khi khÃ´ng set token", () => {
    delete process.env.STEALTH_API_TOKEN;
    assert.strictEqual(checkAuth({ headers: {} }, "/api/profiles").ok, true);
  });
  await test("health luÃ´n má»Ÿ dÃ¹ cÃ³ token", () => {
    process.env.STEALTH_API_TOKEN = "secret";
    assert.strictEqual(checkAuth({ headers: {} }, "/api/health").ok, true);
  });
  await test("thiáº¿u token â†’ 401", () => {
    process.env.STEALTH_API_TOKEN = "secret";
    const r = checkAuth({ headers: {} }, "/api/profiles");
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.status, 401);
  });
  await test("token sai â†’ 403", () => {
    process.env.STEALTH_API_TOKEN = "secret";
    const r = checkAuth({ headers: { authorization: "Bearer nope" } }, "/api/profiles");
    assert.strictEqual(r.status, 403);
  });
  await test("token Ä‘Ãºng (Bearer / X-Api-Token)", () => {
    process.env.STEALTH_API_TOKEN = "secret";
    assert.strictEqual(checkAuth({ headers: { authorization: "Bearer secret" } }, "/api/profiles").ok, true);
    assert.strictEqual(checkAuth({ headers: { "x-api-token": "secret" } }, "/api/profiles").ok, true);
  });
  delete process.env.STEALTH_API_TOKEN;

  console.log("job-queue:");
  await test("cháº¡y job vÃ  tráº£ result + event end", async () => {
    const q = new JobQueue({ concurrency: 1 });
    const events = [];
    const id = q.enqueue({ type: "demo", run: async (emit) => { emit({ event: "progress" }); return { ok: true, n: 42 }; } });
    q.subscribe(id, (e) => events.push(e.event));
    await new Promise((r) => setTimeout(r, 50));
    const job = q.get(id);
    assert.strictEqual(job.status, "done");
    assert.deepStrictEqual(job.result, { ok: true, n: 42 });
    assert.ok(events.includes("end"));
  });
  await test("job lá»—i â†’ status error", async () => {
    const q = new JobQueue({ concurrency: 1 });
    const id = q.enqueue({ type: "boom", run: async () => { throw new Error("ná»•"); } });
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(q.get(id).status, "error");
    assert.match(q.get(id).error, /ná»•/);
  });
  await test("concurrency=1 cháº¡y tuáº§n tá»±", async () => {
    const q = new JobQueue({ concurrency: 1 });
    let active = 0; let maxActive = 0;
    const mk = () => q.enqueue({ type: "x", run: async () => {
      active += 1; maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 20));
      active -= 1;
    } });
    mk(); mk(); mk();
    await new Promise((r) => setTimeout(r, 120));
    assert.strictEqual(maxActive, 1);
  });

  await test("dedupe theo key â€” cÃ¹ng key tráº£ láº¡i job Ä‘ang cháº¡y", async () => {
    const q = new JobQueue({ concurrency: 1 });
    let resolve1;
    const id1 = q.enqueue({ type: "x", key: "profileA", run: () => new Promise((r) => { resolve1 = r; }) });
    const id2 = q.enqueue({ type: "x", key: "profileA", run: async () => 1 });
    assert.strictEqual(id1, id2, "cÃ¹ng key pháº£i tráº£ cÃ¹ng jobId");
    await new Promise((r) => setTimeout(r, 10)); // chá» job cháº¡y Ä‘á»ƒ resolve1 Ä‘Æ°á»£c gÃ¡n
    resolve1();
    await new Promise((r) => setTimeout(r, 30));
    // Sau khi job xong, key Ä‘Æ°á»£c giáº£i phÃ³ng â†’ enqueue má»›i táº¡o job khÃ¡c.
    const id3 = q.enqueue({ type: "x", key: "profileA", run: async () => 1 });
    assert.notStrictEqual(id1, id3);
  });
  await test("retry â€” tháº¥t báº¡i láº§n 1, thÃ nh cÃ´ng láº§n 2", async () => {
    const q = new JobQueue({ concurrency: 1 });
    let n = 0;
    const id = q.enqueue({ type: "flaky", retries: 1, retryDelayMs: 5, run: async () => {
      n += 1;
      if (n === 1) throw new Error("táº¡m lá»—i");
      return { ok: true };
    } });
    await new Promise((r) => setTimeout(r, 80));
    const job = q.get(id);
    assert.strictEqual(job.status, "done");
    assert.strictEqual(job.attempt, 2);
  });

  console.log("proxy-pool:");
  const { parseProxy, formatProxyForLaunch, toPlaywrightProxy, geoConsistency, ProxyPool } = require("./lib/proxy-pool.cjs");
  await test("parseProxy â€” cÃ¡c Ä‘á»‹nh dáº¡ng", () => {
    assert.deepStrictEqual(parseProxy("http://u:p@1.2.3.4:8080"), { protocol: "http", host: "1.2.3.4", port: 8080, username: "u", password: "p" });
    assert.deepStrictEqual(parseProxy("1.2.3.4:8080:u:p"), { protocol: "http", host: "1.2.3.4", port: 8080, username: "u", password: "p" });
    assert.deepStrictEqual(parseProxy("14.249.5.164:32350:infi:infi"), {
      protocol: "http",
      host: "14.249.5.164",
      port: 32350,
      username: "infi",
      password: "infi",
    });
    assert.deepStrictEqual(parseProxy("14.249.5.164:32350:anhhanh"), {
      protocol: "http",
      host: "14.249.5.164",
      port: 32350,
      username: "anhhanh",
      password: "",
    });
    assert.deepStrictEqual(parseProxy("1.2.3.4:8080"), { protocol: "http", host: "1.2.3.4", port: 8080, username: "", password: "" });
    assert.strictEqual(parseProxy("garbage"), null);
    assert.strictEqual(parseProxy("socks5://1.2.3.4:1080").protocol, "socks5");
  });
  await test("formatProxyForLaunch + toPlaywrightProxy", () => {
    assert.strictEqual(
      formatProxyForLaunch("14.249.5.164:32350:infi:infi"),
      "http://infi:infi@14.249.5.164:32350",
    );
    assert.deepStrictEqual(toPlaywrightProxy("14.249.5.164:32350:infi:infi"), {
      server: "http://14.249.5.164:32350",
      username: "infi",
      password: "infi",
    });
  });
  await test("geoConsistency â€” phÃ¡t hiá»‡n lá»‡ch timezone/country", () => {
    const ok = geoConsistency({ timezone: "America/New_York", locale: "en-US" }, { timezone: "America/New_York", countryCode: "US" });
    assert.strictEqual(ok.consistent, true);
    const bad = geoConsistency({ timezone: "America/New_York", locale: "en-US" }, { timezone: "Asia/Bangkok", countryCode: "TH" });
    assert.strictEqual(bad.consistent, false);
    assert.strictEqual(bad.warnings.length, 2);
  });
  await test("ProxyPool â€” round-robin + cooldown", () => {
    const pool = new ProxyPool(["p1", "p2", "p3"]);
    assert.strictEqual(pool.assign("A"), "p1");
    assert.strictEqual(pool.assign("B"), "p2");
    assert.strictEqual(pool.assign("A"), "p1"); // giá»¯ assignment cÅ©
    pool.markBad("p3", 1000, 0);
    assert.strictEqual(pool.available(0), 2);
    assert.strictEqual(pool.available(2000), 3); // háº¿t cooldown
  });

  console.log("fingerprint-diversify:");
  const { deriveDeviceProfile, isDefaultDevice } = require("./lib/fingerprint-diversify.cjs");
  await test("deterministic â€” cÃ¹ng seed cho cÃ¹ng káº¿t quáº£", () => {
    const a = deriveDeviceProfile(123456, { colors: true });
    const b = deriveDeviceProfile(123456, { colors: true });
    assert.deepStrictEqual(a, b);
    assert.strictEqual(a.windowMode, "preset-viewport");
    assert.ok(a.viewportW > 0 && a.viewportH > 0);
  });
  await test("khÃ´ng hard-set timezone/locale (Ä‘á»ƒ geoip lo)", () => {
    const d = deriveDeviceProfile(999, { colors: true, platforms: true });
    assert.strictEqual(d.timezone, undefined);
    assert.strictEqual(d.locale, undefined);
  });
  await test("phÃ¢n bá»‘ viewport Ä‘a dáº¡ng + há»£p lÃ½ qua 2000 seed", () => {
    const counts = {};
    for (let s = 1; s <= 2000; s += 1) {
      const k = (() => { const d = deriveDeviceProfile(s * 1009); return `${d.viewportW}x${d.viewportH}`; })();
      counts[k] = (counts[k] || 0) + 1;
    }
    const distinct = Object.keys(counts).length;
    assert.ok(distinct >= 6, `viewport pháº£i Ä‘a dáº¡ng (${distinct} loáº¡i)`);
    const top = Math.max(...Object.values(counts));
    assert.ok(top / 2000 < 0.4, "khÃ´ng loáº¡i nÃ o chiáº¿m >40%");
  });
  await test("isDefaultDevice â€” nháº­n diá»‡n blank vs Ä‘Ã£ cáº¥u hÃ¬nh", () => {
    assert.strictEqual(isDefaultDevice({ windowMode: "host-maximized", viewportW: 0, viewportH: 0 }), true);
    assert.strictEqual(isDefaultDevice({ windowMode: "preset-viewport", viewportW: 1536, viewportH: 864 }), false);
    assert.strictEqual(isDefaultDevice({ windowMode: "host-maximized", viewportW: 0, viewportH: 0, timezone: "Asia/Bangkok" }), false);
  });

  console.log("pagination:");
  await test("listProfilesPage â€” limit/offset/total/search", async () => {
    const os = require("node:os"); const path = require("node:path"); const fs = require("node:fs");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-pg-"));
    const { openDatabase, flushDatabase, closeDatabase } = require("./db/init.cjs");
    await openDatabase(tmp);
    const svc = require("./db/profile-service.cjs");
    for (let i = 0; i < 250; i += 1) svc.createProfile({ name: String(i).padStart(4, "0") });
    const page = svc.listProfilesPage({ limit: 50, offset: 0 });
    assert.strictEqual(page.profiles.length, 50);
    assert.strictEqual(page.total, 250);
    const p2 = svc.listProfilesPage({ limit: 50, offset: 240 });
    assert.strictEqual(p2.profiles.length, 10);
    const search = svc.listProfilesPage({ search: "0001" });
    assert.strictEqual(search.total, 1);
    flushDatabase(); closeDatabase();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* debounce flush */ }
  });

  console.log("route registry:");
  await test("gá»™p core + domain plugins, match path máº«u", () => {
    const noop = () => {};
    const { routes } = buildRoutes({
      sessionManager: { isRunning: () => false, getDebugPort: () => 0, syncProfileStatuses: noop },
      profileService: { listProfiles: () => [], getProfile: () => null },
      jobQueue: new JobQueue(),
      userDataRoot: "",
      send: { json: noop, sse: () => ({ send: noop, end: noop }) }
    });
    const ids = routes.map((r) => r.id);
    for (const want of ["profiles.list", "profiles.patch", "profiles.update", "profiles.cdp", "stealth-sync.status", "proxy.check", "jobs.enqueue", "jobs.stats", "jobs.events", "fb.create-pages"]) {
      assert.ok(ids.includes(want), `thiáº¿u route ${want}`);
    }
    // jobs.stats pháº£i Ä‘á»©ng TRÆ¯á»šC jobs.get Ä‘á»ƒ khÃ´ng bá»‹ nuá»‘t pattern.
    assert.ok(ids.indexOf("jobs.stats") < ids.indexOf("jobs.get"), "jobs.stats pháº£i trÆ°á»›c jobs.get");
    const cdp = routes.find((r) => r.id === "profiles.cdp");
    assert.ok(cdp.pattern.test("/api/profiles/abc-123/cdp"));
    const jobsGet = routes.find((r) => r.id === "jobs.get");
    assert.ok(jobsGet.pattern.test("/api/jobs/xyz"));
  });

  if (failures) {
    console.error(`\nâœ— api-routes: ${failures} test tháº¥t báº¡i`);
    process.exit(1);
  }
  console.log("\nâœ“ api-routes: all passed");
})();

