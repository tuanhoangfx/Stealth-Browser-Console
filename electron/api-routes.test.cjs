"use strict";
/** Smoke test thuần Node cho auth gate, job queue và route registry (không cần Electron). */
const assert = require("node:assert");

const { checkAuth } = require("./lib/api-auth.cjs");
const { JobQueue } = require("./lib/job-queue.cjs");
const { buildRoutes } = require("./api-routes.cjs");

let failures = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`  ✓ ${name}`))
    .catch((err) => {
      failures += 1;
      console.error(`  ✗ ${name}: ${err.message}`);
    });
}

(async () => {
  console.log("api-auth:");
  await test("mở khi không set token", () => {
    delete process.env.STEALTH_API_TOKEN;
    assert.strictEqual(checkAuth({ headers: {} }, "/api/profiles").ok, true);
  });
  await test("health luôn mở dù có token", () => {
    process.env.STEALTH_API_TOKEN = "secret";
    assert.strictEqual(checkAuth({ headers: {} }, "/api/health").ok, true);
  });
  await test("thiếu token → 401", () => {
    process.env.STEALTH_API_TOKEN = "secret";
    const r = checkAuth({ headers: {} }, "/api/profiles");
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.status, 401);
  });
  await test("token sai → 403", () => {
    process.env.STEALTH_API_TOKEN = "secret";
    const r = checkAuth({ headers: { authorization: "Bearer nope" } }, "/api/profiles");
    assert.strictEqual(r.status, 403);
  });
  await test("token đúng (Bearer / X-Api-Token)", () => {
    process.env.STEALTH_API_TOKEN = "secret";
    assert.strictEqual(checkAuth({ headers: { authorization: "Bearer secret" } }, "/api/profiles").ok, true);
    assert.strictEqual(checkAuth({ headers: { "x-api-token": "secret" } }, "/api/profiles").ok, true);
  });
  delete process.env.STEALTH_API_TOKEN;

  console.log("job-queue:");
  await test("chạy job và trả result + event end", async () => {
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
  await test("job lỗi → status error", async () => {
    const q = new JobQueue({ concurrency: 1 });
    const id = q.enqueue({ type: "boom", run: async () => { throw new Error("nổ"); } });
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(q.get(id).status, "error");
    assert.match(q.get(id).error, /nổ/);
  });
  await test("concurrency=1 chạy tuần tự", async () => {
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

  await test("dedupe theo key — cùng key trả lại job đang chạy", async () => {
    const q = new JobQueue({ concurrency: 1 });
    let resolve1;
    const id1 = q.enqueue({ type: "x", key: "profileA", run: () => new Promise((r) => { resolve1 = r; }) });
    const id2 = q.enqueue({ type: "x", key: "profileA", run: async () => 1 });
    assert.strictEqual(id1, id2, "cùng key phải trả cùng jobId");
    await new Promise((r) => setTimeout(r, 10)); // chờ job chạy để resolve1 được gán
    resolve1();
    await new Promise((r) => setTimeout(r, 30));
    // Sau khi job xong, key được giải phóng → enqueue mới tạo job khác.
    const id3 = q.enqueue({ type: "x", key: "profileA", run: async () => 1 });
    assert.notStrictEqual(id1, id3);
  });
  await test("retry — thất bại lần 1, thành công lần 2", async () => {
    const q = new JobQueue({ concurrency: 1 });
    let n = 0;
    const id = q.enqueue({ type: "flaky", retries: 1, retryDelayMs: 5, run: async () => {
      n += 1;
      if (n === 1) throw new Error("tạm lỗi");
      return { ok: true };
    } });
    await new Promise((r) => setTimeout(r, 80));
    const job = q.get(id);
    assert.strictEqual(job.status, "done");
    assert.strictEqual(job.attempt, 2);
  });

  console.log("proxy-pool:");
  const { parseProxy, geoConsistency, ProxyPool } = require("./lib/proxy-pool.cjs");
  await test("parseProxy — các định dạng", () => {
    assert.deepStrictEqual(parseProxy("http://u:p@1.2.3.4:8080"), { protocol: "http", host: "1.2.3.4", port: 8080, username: "u", password: "p" });
    assert.deepStrictEqual(parseProxy("1.2.3.4:8080:u:p"), { protocol: "http", host: "1.2.3.4", port: 8080, username: "u", password: "p" });
    assert.deepStrictEqual(parseProxy("1.2.3.4:8080"), { protocol: "http", host: "1.2.3.4", port: 8080, username: "", password: "" });
    assert.strictEqual(parseProxy("garbage"), null);
    assert.strictEqual(parseProxy("socks5://1.2.3.4:1080").protocol, "socks5");
  });
  await test("geoConsistency — phát hiện lệch timezone/country", () => {
    const ok = geoConsistency({ timezone: "America/New_York", locale: "en-US" }, { timezone: "America/New_York", countryCode: "US" });
    assert.strictEqual(ok.consistent, true);
    const bad = geoConsistency({ timezone: "America/New_York", locale: "en-US" }, { timezone: "Asia/Bangkok", countryCode: "TH" });
    assert.strictEqual(bad.consistent, false);
    assert.strictEqual(bad.warnings.length, 2);
  });
  await test("ProxyPool — round-robin + cooldown", () => {
    const pool = new ProxyPool(["p1", "p2", "p3"]);
    assert.strictEqual(pool.assign("A"), "p1");
    assert.strictEqual(pool.assign("B"), "p2");
    assert.strictEqual(pool.assign("A"), "p1"); // giữ assignment cũ
    pool.markBad("p3", 1000, 0);
    assert.strictEqual(pool.available(0), 2);
    assert.strictEqual(pool.available(2000), 3); // hết cooldown
  });

  console.log("fingerprint-diversify:");
  const { deriveDeviceProfile, isDefaultDevice } = require("./lib/fingerprint-diversify.cjs");
  await test("deterministic — cùng seed cho cùng kết quả", () => {
    const a = deriveDeviceProfile(123456, { colors: true });
    const b = deriveDeviceProfile(123456, { colors: true });
    assert.deepStrictEqual(a, b);
    assert.strictEqual(a.windowMode, "preset-viewport");
    assert.ok(a.viewportW > 0 && a.viewportH > 0);
  });
  await test("không hard-set timezone/locale (để geoip lo)", () => {
    const d = deriveDeviceProfile(999, { colors: true, platforms: true });
    assert.strictEqual(d.timezone, undefined);
    assert.strictEqual(d.locale, undefined);
  });
  await test("phân bố viewport đa dạng + hợp lý qua 2000 seed", () => {
    const counts = {};
    for (let s = 1; s <= 2000; s += 1) {
      const k = (() => { const d = deriveDeviceProfile(s * 1009); return `${d.viewportW}x${d.viewportH}`; })();
      counts[k] = (counts[k] || 0) + 1;
    }
    const distinct = Object.keys(counts).length;
    assert.ok(distinct >= 6, `viewport phải đa dạng (${distinct} loại)`);
    const top = Math.max(...Object.values(counts));
    assert.ok(top / 2000 < 0.4, "không loại nào chiếm >40%");
  });
  await test("isDefaultDevice — nhận diện blank vs đã cấu hình", () => {
    assert.strictEqual(isDefaultDevice({ windowMode: "host-maximized", viewportW: 0, viewportH: 0 }), true);
    assert.strictEqual(isDefaultDevice({ windowMode: "preset-viewport", viewportW: 1536, viewportH: 864 }), false);
    assert.strictEqual(isDefaultDevice({ windowMode: "host-maximized", viewportW: 0, viewportH: 0, timezone: "Asia/Bangkok" }), false);
  });

  console.log("pagination:");
  await test("listProfilesPage — limit/offset/total/search", async () => {
    const os = require("node:os"); const path = require("node:path"); const fs = require("node:fs");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-pg-"));
    const { openDatabase, flushDatabase, closeDatabase } = require("./db/init.cjs");
    await openDatabase(tmp);
    const svc = require("./db/profile-service.cjs");
    for (let i = 0; i < 250; i += 1) svc.createProfile({ name: `Acc${String(i).padStart(3, "0")}` });
    const page = svc.listProfilesPage({ limit: 50, offset: 0 });
    assert.strictEqual(page.profiles.length, 50);
    assert.strictEqual(page.total, 250);
    const p2 = svc.listProfilesPage({ limit: 50, offset: 240 });
    assert.strictEqual(p2.profiles.length, 10);
    const search = svc.listProfilesPage({ search: "Acc001" });
    assert.strictEqual(search.total, 1);
    flushDatabase(); closeDatabase();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* debounce flush */ }
  });

  console.log("route registry:");
  await test("gộp core + domain plugins, match path mẫu", () => {
    const noop = () => {};
    const { routes } = buildRoutes({
      sessionManager: { isRunning: () => false, getDebugPort: () => 0, syncProfileStatuses: noop },
      profileService: { listProfiles: () => [], getProfile: () => null },
      jobQueue: new JobQueue(),
      userDataRoot: "",
      send: { json: noop, sse: () => ({ send: noop, end: noop }) }
    });
    const ids = routes.map((r) => r.id);
    for (const want of ["profiles.list", "profiles.cdp", "proxy.check", "jobs.enqueue", "jobs.stats", "jobs.events", "fb.create-pages"]) {
      assert.ok(ids.includes(want), `thiếu route ${want}`);
    }
    // jobs.stats phải đứng TRƯỚC jobs.get để không bị nuốt pattern.
    assert.ok(ids.indexOf("jobs.stats") < ids.indexOf("jobs.get"), "jobs.stats phải trước jobs.get");
    const cdp = routes.find((r) => r.id === "profiles.cdp");
    assert.ok(cdp.pattern.test("/api/profiles/abc-123/cdp"));
    const jobsGet = routes.find((r) => r.id === "jobs.get");
    assert.ok(jobsGet.pattern.test("/api/jobs/xyz"));
  });

  if (failures) {
    console.error(`\n✗ api-routes: ${failures} test thất bại`);
    process.exit(1);
  }
  console.log("\n✓ api-routes: all passed");
})();
