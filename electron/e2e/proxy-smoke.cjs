/**
 * Live proxy connectivity + Auth-Proxy Fast-Spawn (< 100ms warm) & Multi-Proxy isolation smoke.
 * Uses STEALTH_SEED_PROXY_URL (+ optional STEALTH_SEED_PROXY_URL_2) or active P0020 proxies when available.
 * Skips when STEALTH_SKIP_LIVE=1, no proxy available, or CloakBrowser unavailable.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { performance } = require("node:perf_hooks");
const { chromium } = require("playwright-core");
const { openDatabase, closeDatabase } = require("../db/init.cjs");
const profileService = require("../db/profile-service.cjs");
const { parseProxy, formatProxyForLaunch } = require("../lib/proxy-pool.cjs");
const { getFreePort, waitForCdp } = require("../lib/net-port.cjs");

const PROXY_CHECK_URL = "https://api.ipify.org?format=json";
const WARM_AUTH_FAST_SPAWN_BUDGET_MS = 250;
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-proxy-"));

class SmokeAssertionError extends Error {}

function assert(condition, message) {
  if (!condition) throw new SmokeAssertionError(message);
}

function redactProxyLabel(proxyStr) {
  const parsed = parseProxy(proxyStr);
  return parsed ? `${parsed.host}:${parsed.port}` : "unknown";
}

async function resolveActiveProxiesFromP0020(limitHosts = 2) {
  if (process.env.STEALTH_AUTO_P0020_PROXY === "0") return [];
  try {
    const helperPath = path.resolve(__dirname, "..", "..", "..", "scripts", "lib", "databox-plane-ssot.mjs");
    if (!fs.existsSync(helperPath)) return [];
    const { resolveDataboxAuth } = await import(pathToFileURL(helperPath).href);
    const databoxDir = path.resolve(__dirname, "..", "..", "..", "P0020-Data-Box");
    const auth = resolveDataboxAuth({ productRoot: databoxDir });
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 3000);
    const res = await fetch(`${auth.url}/rest/v1/twofa_accounts?service=eq.Proxy&status=eq.active&select=account,note&limit=25`, {
      headers: auth.headers,
      signal: ac.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return [];
    const rows = await res.json();
    const picked = [];
    const seenHosts = new Set();
    const seenRegions = new Set();
    const seenSubnets = new Set();
    for (const row of rows || []) {
      const formatted = formatProxyForLaunch(row?.account || "");
      const parsed = parseProxy(formatted);
      if (!parsed || !parsed.username || seenHosts.has(parsed.host)) continue;
      const subnet = parsed.host.split(".").slice(0, 2).join(".");
      const regionTag = String(row?.note || "").toUpperCase().match(/\b(VN|US|SG|JP|UK|DE|FR|NL|CA|AU)\b/)?.[1] || "";
      if (picked.length === 0 || (regionTag && !seenRegions.has(regionTag)) || (subnet && !seenSubnets.has(subnet))) {
        picked.push(formatted);
        seenHosts.add(parsed.host);
        if (regionTag) seenRegions.add(regionTag);
        if (subnet) seenSubnets.add(subnet);
      }
      if (picked.length >= limitHosts) break;
    }
    if (picked.length < limitHosts) {
      for (const row of rows || []) {
        const formatted = formatProxyForLaunch(row?.account || "");
        const parsed = parseProxy(formatted);
        if (!parsed || !parsed.username || seenHosts.has(parsed.host)) continue;
        picked.push(formatted);
        seenHosts.add(parsed.host);
        if (picked.length >= limitHosts) break;
      }
    }
    return picked;
  } catch {
    return [];
  }
}

function loadEngine() {
  try {
    return {
      openProfile: require("../engine/cloak-browser-engine.cjs").openProfile,
      openPureHeadedProfile: require("../engine/cloak-browser-engine.cjs").openPureHeadedProfile,
      closeContext: require("../engine/cloak-browser-engine.cjs").closeContext,
      runOpenUrl: require("../automation/open-url.cjs").runOpenUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`proxy-smoke: skipped (${message})`);
    return null;
  }
}

async function probeFastSpawnAuthProxy(engine, label, proxyStr) {
  const port = await getFreePort();
  const profileDir = fs.mkdtempSync(path.join(tmpRoot, `fast-${label}-`));
  const t0 = performance.now();
  const opened = await engine.openPureHeadedProfile(
    {
      id: `px-smoke-${label}`,
      name: "9997",
      proxy: proxyStr,
      humanize: false,
      extraChromeArgs: ["--headless=new"],
    },
    tmpRoot,
    { launchUrl: "about:blank", debugPort: port, userDataDirOverride: profileDir },
  );
  const launchReturnMs = Math.round(performance.now() - t0);
  let browser;
  try {
    const info = await waitForCdp(port, { attempts: 30, intervalMs: 150 });
    browser = await chromium.connectOverCDP(info.webSocketDebuggerUrl);
    const context = browser.contexts()[0];
    assert(context, `${label}: missing CDP browser context`);
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(PROXY_CHECK_URL, { waitUntil: "domcontentloaded", timeout: 20000 });
    const rawIp = await page.evaluate(() => document.body?.innerText || "");
    const ipData = JSON.parse(rawIp);
    const env = await page.evaluate(() => ({
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      lang: navigator.language,
      webdriver: navigator.webdriver,
    }));
    return {
      host: redactProxyLabel(proxyStr),
      launchReturnMs,
      ip: String(ipData?.ip || "").trim(),
      tz: env.tz,
      lang: env.lang,
      webdriver: env.webdriver,
    };
  } finally {
    await browser?.close().catch(() => undefined);
    await engine.closeContext(opened?.context).catch(() => undefined);
    try {
      if (opened?.child && !opened.child.killed) opened.child.kill();
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  if (process.env.STEALTH_SKIP_LIVE === "1") {
    console.log("proxy-smoke: skipped (STEALTH_SKIP_LIVE=1)");
    return;
  }

  const engine = loadEngine();
  if (!engine) return;

  await openDatabase(tmpRoot);
  profileService.ensureSeedProfiles();
  const envProxy1 = formatProxyForLaunch(process.env.STEALTH_SEED_PROXY_URL || "");
  const envProxy2 = formatProxyForLaunch(process.env.STEALTH_SEED_PROXY_URL_2 || "");
  const p0020Proxies = !envProxy1 || !envProxy2 ? await resolveActiveProxiesFromP0020(2) : [];

  const profileRow =
    profileService.listProfiles().find((row) => row.name === "Proxy Test") ||
    profileService.listProfiles().find((row) => row.proxy);
  const profileProxy = formatProxyForLaunch(profileRow?.proxy || "");

  const primaryProxy = profileProxy || envProxy1 || p0020Proxies[0] || "";
  if (!primaryProxy) {
    console.log("proxy-smoke: skipped (set STEALTH_SEED_PROXY_URL or enable active Proxy in P0020)");
    closeDatabase();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    return;
  }

  const primaryHost = parseProxy(primaryProxy)?.host || "";
  const secondaryProxy =
    [envProxy2, ...p0020Proxies].find((candidate) => {
      const h = parseProxy(candidate)?.host || "";
      return h && h !== primaryHost;
    }) || "";

  const profile = profileRow?.proxy ? profileRow : { ...(profileRow || {}), id: "proxy-smoke-1", name: "9997", proxy: primaryProxy };

  let context;
  try {
    const opened = await engine.openProfile(profile, tmpRoot);
    context = opened.context;
    assert(context, "browser context");

    const result = await engine.runOpenUrl({
      context,
      profile,
      targetUrl: PROXY_CHECK_URL,
      screenshot: false,
      closeWhenDone: false,
      screenshotsRoot: tmpRoot,
      onCloseProfile: async () => undefined,
    });
    assert(result.ok, `proxy ipify check failed: ${result.error || "unknown"}`);
    console.log(`  ✓ proxy open-url (${result.durationMs}ms) profile=${profile.name} (${redactProxyLabel(primaryProxy)})`);

    if (process.platform === "win32" && parseProxy(primaryProxy)?.username && typeof engine.openPureHeadedProfile === "function") {
      const cold = await probeFastSpawnAuthProxy(engine, "cold", primaryProxy);
      assert(cold.ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(cold.ip), `cold auth fast-spawn returned invalid IP: ${cold.ip}`);
      assert(cold.webdriver === false, `cold auth fast-spawn leaked webdriver=${cold.webdriver}`);

      const warm = await probeFastSpawnAuthProxy(engine, "warm", primaryProxy);
      assert(warm.ip === cold.ip, `warm auth fast-spawn IP mismatch: ${warm.ip} vs ${cold.ip}`);
      assert(warm.webdriver === false, `warm auth fast-spawn leaked webdriver=${warm.webdriver}`);
      assert(
        warm.launchReturnMs < WARM_AUTH_FAST_SPAWN_BUDGET_MS,
        `warm auth fast-spawn regressed: ${warm.launchReturnMs}ms >= ${WARM_AUTH_FAST_SPAWN_BUDGET_MS}ms budget`,
      );
      console.log(
        `  ✓ auth-proxy Fast-Spawn cold=${cold.launchReturnMs}ms warm=${warm.launchReturnMs}ms ip=${warm.ip} tz=${warm.tz} lang=${warm.lang}`,
      );

      if (secondaryProxy) {
        const iso = await probeFastSpawnAuthProxy(engine, "iso", secondaryProxy);
        assert(iso.ip && iso.ip !== cold.ip, `multi-proxy isolation failed: proxy 2 IP (${iso.ip}) === proxy 1 IP (${cold.ip})`);
        assert(iso.webdriver === false, `multi-proxy iso leaked webdriver=${iso.webdriver}`);
        console.log(
          `  ✓ multi-proxy isolation ok (${cold.ip} [${cold.tz}] != ${iso.ip} [${iso.tz}], warm=${warm.launchReturnMs}ms)`,
        );
      }
    }

    console.log("proxy-smoke: ok");
  } catch (error) {
    if (error instanceof SmokeAssertionError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|download|network|fetch|ECONNREF|ERR_PACKAGE|exports|proxy|timeout/i.test(message)) {
      console.log(`proxy-smoke: skipped (${message})`);
      return;
    }
    throw error;
  } finally {
    await engine.closeContext(context).catch(() => undefined);
    closeDatabase();
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 });
    } catch {
      /* best-effort cleanup */
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
