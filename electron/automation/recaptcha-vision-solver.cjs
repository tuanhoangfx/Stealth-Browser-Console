"use strict";

/**
 * Shared SSOT Google reCAPTCHA v2/Enterprise Vision Solver + Recovery Email & QR Challenge Bridge
 * (`ok 1`, `ok 2`, `ok 3`).
 *
 * Key capabilities:
 *  1. `Page.getFrameTree` + `Page.createIsolatedWorld` cross-origin iframe inspection & interaction
 *     (works even when Chromium co-locates `recaptcha/api2/anchor` & `bframe` in the parent target).
 *  2. Multimodal Vision (`ag/gemini-3.8-flash-low` via `9router.infi.io.vn/v1/chat/completions`)
 *     supporting both SSE (`data: {...}`) and JSON responses for 3x3 (1..9) and 4x4 (1..16) grids.
 *  3. Playwright adapter (`solveGoogleRecaptchaOnPlaywrightPage`) for `script-steps.cjs` & `P0002`,
 *     plus raw CDP adapter (`solveGoogleRecaptchaViaCdp`) for direct WebSocket CDP runners.
 *  4. Recovery email matcher & challenge solver (`matchMaskedRecoveryEmail`, `handleGoogleRecoveryEmailChallengeViaCdp`).
 *  5. QR challenge (`/v3/signin/challenge/iap/qrcode`) decoder & Android Stealth Bridge dispatcher (`handleGoogleQrChallengeViaCdp`).
 */

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_ROUTER_CONFIG_PATH = path.resolve(__dirname, "../../config/router.local.json");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadRouterConfig(configPath = DEFAULT_ROUTER_CONFIG_PATH) {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (parsed && typeof parsed.baseUrl === "string") {
      parsed.baseUrl = parsed.baseUrl.replace("9router.infi.io.vn", "9router.infi28.com");
    }
    return parsed;
  } catch {
    return {
      baseUrl: "https://9router.infi28.com/v1",
      apiKey: "sk-uer05xqnhp3s2ii0-7p7jal-a3b87e60",
      visionModel: "ag/gemini-3-flash",
    };
  }
}

/**
 * Extracts raw text content from a `9router` / OpenAI-compatible HTTP response body,
 * supporting both Server-Sent Events (`data: {...}`) and standard JSON (`choices[0].message.content`).
 */
function extractVisionResponseText(rawBody = "") {
  const text = String(rawBody || "").trim();
  if (!text) return "";
  if (text.startsWith("data:")) {
    let combined = "";
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:") || trimmed === "data: [DONE]") continue;
      try {
        const chunk = JSON.parse(trimmed.slice(5).trim());
        const delta =
          chunk?.choices?.[0]?.delta?.content ??
          chunk?.choices?.[0]?.message?.content ??
          "";
        if (typeof delta === "string") combined += delta;
      } catch {
        /* ignore malformed SSE chunk */
      }
    }
    return combined.trim();
  }
  try {
    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content || "";
    if (Array.isArray(content)) {
      return content.map((c) => c?.text || "").join(" ").trim();
    }
    return String(content || "").trim();
  } catch {
    return text;
  }
}

/**
 * Parses tile numbers (1..9 for 3x3, 1..16 for 4x4) from Vision model output.
 */
function parseVisionTileNumbers(rawContent = "", gridSize = 3) {
  const maxTile = gridSize === 4 ? 16 : 9;
  const text = String(rawContent || "").trim();
  if (!text) return [];

  let tiles = [];
  const jsonMatches = text.match(/\{[^{}]*"tiles"\s*:\s*\[[^\]]*\][^{}]*\}/gi) || text.match(/\{[\s\S]*?\}/g) || [];
  for (const cand of jsonMatches) {
    try {
      const parsed = JSON.parse(cand);
      if (Array.isArray(parsed.tiles)) {
        tiles = parsed.tiles
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= maxTile);
        return Array.from(new Set(tiles));
      }
    } catch {
      /* try next json match */
    }
  }
  const arrMatch = text.match(/\[\s*(?:\d+\s*(?:,\s*\d+\s*)*)?\]/);
  if (arrMatch) {
    try {
      const arr = JSON.parse(arrMatch[0]);
      if (Array.isArray(arr)) {
        tiles = arr
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= maxTile);
      }
    } catch {
      /* ignore */
    }
  }
  return Array.from(new Set(tiles));
}

function mapRecaptchaPromptToCapsolverCode(rawPrompt = "") {
  const q = String(rawPrompt || "").toLowerCase();
  if (/^\/m\/[a-z0-9_]+$/i.test(q.trim())) return q.trim();
  if (/(crosswalk|pedestrian crossing)/i.test(q)) return "/m/014xcs";
  if (/(bicycle|bike)/i.test(q)) return "/m/0199g";
  if (/(motorcycle|motor|scooter)/i.test(q)) return "/m/04_sv";
  if (/(bus|buses)/i.test(q)) return "/m/01bjv";
  if (/(traffic light|signal)/i.test(q)) return "/m/015qff";
  if (/(fire hydrant|hydrant)/i.test(q)) return "/m/01pns0";
  if (/(stair)/i.test(q)) return "/m/01lynh";
  if (/(bridge)/i.test(q)) return "/m/015kr";
  if (/(boat|ship)/i.test(q)) return "/m/019jd";
  if (/(chimney)/i.test(q)) return "/m/01jk_4";
  if (/(tractor)/i.test(q)) return "/m/013xlm";
  if (/(taxi|cab)/i.test(q)) return "/m/0pg52";
  if (/(palm)/i.test(q)) return "/m/0cdl1";
  if (/(mountain|hill)/i.test(q)) return "/m/09d_r";
  if (/(parking meter)/i.test(q)) return "/m/015qbp";
  if (/\b(car|cars|vehicle|vehicles|automobile)\b/i.test(q)) return "/m/0k4j";
  return "";
}

/**
 * Calls CapSolver `ReCaptchaV2Classification` first, then falls back to 9Router Vision API to identify matching reCAPTCHA grid tiles.
 */
async function askVisionForRecaptchaTiles(
  base64Png,
  targetPrompt,
  gridSize = 3,
  { fetchFn = fetch, routerConfig = null, timeoutMs = 25000 } = {},
) {
  const cfg = routerConfig || loadRouterConfig();
  const baseUrl = String(cfg.baseUrl || "https://9router.infi28.com/v1").replace(/\/+$/, "");
  const apiKey = cfg.apiKey || "sk-uer05xqnhp3s2ii0-7p7jal-a3b87e60";
  const maxTile = gridSize === 4 ? 16 : 9;

  // Tier 1: CapSolver ReCaptchaV2Classification (1-based tile indices)
  const capsolverKey = process.env.CAPSOLVER_API_KEY || "CAP-1C2D156ADF1974E279B0DEF1F3DAB7A9B48E2E5339535AB8FEACA0F97F9B0011";
  const capCode = mapRecaptchaPromptToCapsolverCode(targetPrompt);
  if (capsolverKey && capCode && !askVisionForRecaptchaTiles._capsolverDisabled) {
    try {
      const capRes = await fetchFn("https://api.capsolver.com/createTask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientKey: capsolverKey,
          task: {
            type: "ReCaptchaV2Classification",
            image: base64Png,
            question: capCode,
          },
        }),
        signal: AbortSignal.timeout(8000),
      });
      const capBody = await capRes.json().catch(() => null);
      if (capBody?.errorCode === "ERROR_KEY_DENIED_ACCESS" || capBody?.errorId === 1) {
        askVisionForRecaptchaTiles._capsolverDisabled = true;
      } else if (capBody && capBody.errorId === 0 && capBody.solution && Array.isArray(capBody.solution.objects)) {
        const tiles = capBody.solution.objects
          .map((idx0) => Number(idx0) + 1)
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= maxTile);
        return { ok: true, tiles, raw: JSON.stringify({ tiles }), model: "capsolver" };
      }
    } catch {
      /* fallback to 9Router Vision */
    }
  }
  const layoutDesc =
    gridSize === 4
      ? "4x4 grid (Row 1: 1, 2, 3, 4; Row 2: 5, 6, 7, 8; Row 3: 9, 10, 11, 12; Row 4: 13, 14, 15, 16)"
      : "3x3 grid (Row 1: 1, 2, 3; Row 2: 4, 5, 6; Row 3: 7, 8, 9)";

  const systemPrompt = [
    `You are an image grid object detector for an automated UI test.`,
    `The image is a ${layoutDesc} of square photo tiles. Each tile has its 1-based tile number (1 to ${maxTile}) in the top-left corner.`,
    `Target object to detect: "${targetPrompt}".`,
    `Return ONLY a compact JSON object with 1-based tile numbers (between 1 and ${maxTile}) that clearly contain "${targetPrompt}" (do not select road/sky background tiles that do not touch the "${targetPrompt}").`,
    `If no tiles match, return {"tiles":[]}.`,
  ].join(" ");

  const baseModels = [
    "ag/claude-sonnet-4-6",
    "ag/gemini-3-flash",
    "ag/gemini-2.5-flash",
    "ag/claude-sonnet-5-5",
    "ag/claude-sonnet-5-5-low",
    "ag/gemini-3.8-flash",
    "cx/gpt-5.6-luna-review",
    "cx/gpt-5.6-sol-review",
    "cx/gpt-5.6-terra-review",
    "cx/gpt-6.1-sol",
    "cx/gpt-6-astra",
    "cx/gpt-6-luna",
    "cx/gpt-5.6-luna",
    "cx/gpt-5.6-terra",
    "cx/gpt-6-sol",
    "cx/gpt-5.6-sol",
  ];
  const nowMs = Date.now();
  const codexInCooldown =
    askVisionForRecaptchaTiles._codexCooldownUntil && nowMs < askVisionForRecaptchaTiles._codexCooldownUntil;
  const geminiInCooldown =
    askVisionForRecaptchaTiles._geminiCooldownUntil && nowMs < askVisionForRecaptchaTiles._geminiCooldownUntil;
  const rotIdx = (askVisionForRecaptchaTiles._callIdx = (askVisionForRecaptchaTiles._callIdx || 0) + 1);
  const modelsToTry = baseModels.filter(
    (m) => (!codexInCooldown || !m.startsWith("cx/")) && (!geminiInCooldown || !m.startsWith("ag/gemini-")),
  );
  const keyPool = [apiKey, ...Object.values(cfg.apiKeys || {}).filter(Boolean)].filter(Boolean);
  if (keyPool.length === 0) keyPool.push(apiKey);
  let lastError = "";
  const perModelTimeoutMs = Math.min(Number(timeoutMs) || 10000, 10000);
  for (let mIdx = 0; mIdx < modelsToTry.length; mIdx += 1) {
    const model = modelsToTry[mIdx];
    if (
      model.startsWith("cx/") &&
      askVisionForRecaptchaTiles._codexCooldownUntil &&
      Date.now() < askVisionForRecaptchaTiles._codexCooldownUntil
    ) {
      continue;
    }
    if (
      model.startsWith("ag/gemini-") &&
      askVisionForRecaptchaTiles._geminiCooldownUntil &&
      Date.now() < askVisionForRecaptchaTiles._geminiCooldownUntil
    ) {
      continue;
    }
    const activeKey = mIdx === 0 && apiKey ? apiKey : keyPool[(rotIdx + mIdx) % keyPool.length] || apiKey;
    try {
      const res = await fetchFn(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${activeKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.0,
          max_tokens: 512,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: systemPrompt },
                {
                  type: "image_url",
                  image_url: { url: `data:image/png;base64,${base64Png}` },
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(perModelTimeoutMs),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        lastError = `vision_http_${res.status}:${errText.slice(0, 120)}`;
        if (model.startsWith("cx/") && /usage limit has been reached/i.test(errText)) {
          askVisionForRecaptchaTiles._codexCooldownUntil = Date.now() + 90_000;
        } else if (model.startsWith("ag/gemini-")) {
          askVisionForRecaptchaTiles._geminiCooldownUntil = Date.now() + 60_000;
        }
        continue;
      }

      const rawBody = await res.text();
      const raw = extractVisionResponseText(rawBody);
      if (/don't see an image|no image attached|re-upload the grid/i.test(raw)) {
        lastError = `image_stripped_by_${model}`;
        continue;
      }
      if (!/[\{\[][\s\S]*[\}\]]/.test(raw)) {
        lastError = `non_json_by_${model}`;
        continue;
      }
      const tiles = parseVisionTileNumbers(raw, gridSize);
      return { ok: true, tiles, raw, model };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return { ok: false, tiles: [], error: lastError || "vision_all_models_failed" };
}

/**
 * Recursively walks `Page.getFrameTree` result to locate reCAPTCHA `anchor` and `bframe` frames.
 */
function findRecaptchaFramesInTree(frameTree) {
  let anchorFrame = null;
  let bframe = null;
  const walk = (node) => {
    if (!node) return;
    const f = node.frame;
    if (f && f.url) {
      if (/recaptcha\/(?:api2|enterprise)\/anchor/i.test(f.url)) {
        anchorFrame = f;
      } else if (/recaptcha\/(?:api2|enterprise)\/bframe/i.test(f.url)) {
        // Prefer the latest / active bframe if multiple exist
        bframe = f;
      }
    }
    if (Array.isArray(node.childFrames)) {
      for (const child of node.childFrames) walk(child);
    }
  };
  walk(frameTree);
  return { anchorFrame, bframe };
}

/**
 * Evaluates an expression inside a specific `frameId` by creating an isolated world (`Page.createIsolatedWorld`).
 */
async function evalInFrameViaIsolatedWorld(cdpSend, frameId, expression) {
  if (!frameId || typeof cdpSend !== "function") return null;
  try {
    const world = await cdpSend("Page.createIsolatedWorld", {
      frameId,
      worldName: "p0003_recaptcha_solver",
      grantUniveralAccess: true,
    });
    const contextId = world?.executionContextId;
    if (!contextId) return null;
    const res = await cdpSend("Runtime.evaluate", {
      contextId,
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res?.result?.value ?? null;
  } catch {
    return null;
  }
}

async function evalInMainPage(cdpSend, expression) {
  try {
    const res = await cdpSend("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res?.result?.value ?? null;
  } catch {
    return null;
  }
}

async function cdpClickPoint(cdpSend, x, y) {
  const rx = Math.round(Number(x) || 0);
  const ry = Math.round(Number(y) || 0);
  await cdpSend("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: rx,
    y: ry,
  }).catch(() => undefined);
  await sleep(40);
  await cdpSend("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: rx,
    y: ry,
    button: "left",
    clickCount: 1,
  }).catch(() => undefined);
  await sleep(50);
  await cdpSend("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: rx,
    y: ry,
    button: "left",
    clickCount: 1,
  }).catch(() => undefined);
}

/**
 * Inspects the main page for visible reCAPTCHA anchor/bframe bounding boxes and page state.
 */
async function inspectMainPageRecaptchaGeometry(cdpSend) {
  return evalInMainPage(
    cdpSend,
    `(() => {
      const anchorEl = Array.from(document.querySelectorAll('iframe')).find(f => /recaptcha\\/(api2|enterprise)\\/anchor/i.test(f.src || ''));
      const bframes = Array.from(document.querySelectorAll('iframe')).filter(f => /recaptcha\\/(api2|enterprise)\\/bframe/i.test(f.src || ''));
      const bframeEl = bframes.find(f => {
        const r = f.getBoundingClientRect();
        const st = window.getComputedStyle(f);
        return r.width > 200 && r.height > 200 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity || 1) > 0.1;
      }) || null;
      const ar = anchorEl ? anchorEl.getBoundingClientRect() : null;
      const br = bframeEl ? bframeEl.getBoundingClientRect() : null;
      return {
        url: location.href,
        hasAnchor: Boolean(ar && ar.width > 20),
        anchorRect: ar ? { x: ar.x, y: ar.y, width: ar.width, height: ar.height } : null,
        hasBframe: Boolean(br && br.width > 200),
        bframeRect: br ? { x: br.x, y: br.y, width: br.width, height: br.height } : null
      };
    })()`,
  );
}

async function clickMainPageNextButton(cdpSend) {
  return evalInMainPage(
    cdpSend,
    `(() => {
      const btn = document.querySelector('#identifierNext button, #identifierNext, #passwordNext button, #totpNext button, button[jsname="LgbsSe"]');
      if (btn && btn.offsetWidth > 0) {
        btn.click();
        return true;
      }
      return false;
    })()`,
  );
}

/**
 * Solves a Google reCAPTCHA v2 / Enterprise challenge via raw CDP (`cdpSend(method, params)`).
 */
async function solveGoogleRecaptchaViaCdp(
  cdpSend,
  {
    maxRounds = 8,
    onLog = null,
    fetchFn = fetch,
    routerConfig = null,
    clickPageNextOnSolve = true,
  } = {},
) {
  await cdpSend("Page.enable").catch(() => undefined);
  await cdpSend("Runtime.enable").catch(() => undefined);

  const treeRes = await cdpSend("Page.getFrameTree").catch(() => null);
  const { anchorFrame, bframe: initialBframe } = findRecaptchaFramesInTree(treeRes?.frameTree);
  const geo0 = await inspectMainPageRecaptchaGeometry(cdpSend);

  if (!anchorFrame && !initialBframe && !geo0?.hasAnchor && !geo0?.hasBframe) {
    return { ok: true, solved: true, skipped: true, rounds: 0, reason: "no_recaptcha_present" };
  }

  // Step 1: Check if anchor is already checked, or click the checkbox
  let anchorChecked = false;
  if (anchorFrame) {
    const aState = await evalInFrameViaIsolatedWorld(
      cdpSend,
      anchorFrame.id,
      `(() => {
        const el = document.querySelector('#recaptcha-anchor');
        if (!el) return null;
        return { checked: el.getAttribute('aria-checked') === 'true' };
      })()`,
    );
    if (aState?.checked) {
      anchorChecked = true;
    } else if (!geo0?.hasBframe) {
      if (geo0?.anchorRect) {
        await cdpClickPoint(
          cdpSend,
          geo0.anchorRect.x + 28,
          geo0.anchorRect.y + geo0.anchorRect.height / 2,
        );
      }
      await evalInFrameViaIsolatedWorld(
        cdpSend,
        anchorFrame.id,
        `(() => {
          const el = document.querySelector('#recaptcha-anchor');
          if (el) { el.click(); return true; }
          return false;
        })()`,
      );
      onLog?.("info", "Clicked reCAPTCHA anchor checkbox");
      await sleep(2800);
    }
  } else if (geo0?.hasAnchor && !geo0?.hasBframe) {
    await cdpClickPoint(
      cdpSend,
      geo0.anchorRect.x + 28,
      geo0.anchorRect.y + geo0.anchorRect.height / 2,
    );
    onLog?.("info", "Clicked reCAPTCHA anchor checkbox via coordinates");
    await sleep(2800);
  }

  // Step 2: Multi-round Vision loop
  for (let round = 1; round <= maxRounds; round += 1) {
    const curTreeRes = await cdpSend("Page.getFrameTree").catch(() => null);
    const { anchorFrame: curAnchor, bframe: curBframe } = findRecaptchaFramesInTree(curTreeRes?.frameTree);
    const geo = await inspectMainPageRecaptchaGeometry(cdpSend);

    // Did we already leave the reCAPTCHA URL?
    if (geo?.url && !/challenge\/recaptcha|recaptcha\/(?:api2|enterprise)/i.test(geo.url) && !geo?.hasBframe && !geo?.hasAnchor) {
      return { ok: true, solved: true, rounds: round - 1, reason: "navigated_past_recaptcha" };
    }

    if (curAnchor) {
      const aCheck = await evalInFrameViaIsolatedWorld(
        cdpSend,
        curAnchor.id,
        `(() => {
          const el = document.querySelector('#recaptcha-anchor');
          return el ? el.getAttribute('aria-checked') === 'true' : false;
        })()`,
      );
      if (aCheck) {
        anchorChecked = true;
        onLog?.("success", `reCAPTCHA checkbox verified (aria-checked=true) at round ${round}`);
        if (clickPageNextOnSolve) {
          await clickMainPageNextButton(cdpSend);
          await sleep(2500);
        }
        return { ok: true, solved: true, rounds: round - 1, reason: "anchor_checked" };
      }
    }

    if (!curBframe || !geo?.hasBframe || !geo?.bframeRect) {
      await sleep(1200);
      continue;
    }

    const bfInfo = await evalInFrameViaIsolatedWorld(
      cdpSend,
      curBframe.id,
      `(() => {
        const descEl = document.querySelector('.rc-imageselect-desc-no-canonical, .rc-imageselect-desc, #rc-imageselect .rc-imageselect-instructions');
        const strongEl = descEl ? descEl.querySelector('strong') : null;
        const promptText = descEl ? (descEl.innerText || '').replace(/\\s+/g, ' ').trim() : '';
        const target = strongEl ? (strongEl.innerText || '').trim() : promptText;
        const tiles = Array.from(document.querySelectorAll('.rc-imageselect-tile, td[role="button"]'));
        const is4x4 = Boolean(document.querySelector('.rc-imageselect-table-44')) || tiles.length === 16;
        const isDynamic = /none left|click verify once there are none|kh\u00f4ng c\u00f2n h\u00ecnh \u1ea3nh n\u00e0o|khi kh\u00f4ng c\u00f2n|h\u1ebft h\u00ecnh/i.test(promptText) || Boolean(document.querySelector('.rc-imageselect-dynamic-selected'));
        const verifyBtn = document.querySelector('#recaptcha-verify-button');
        const verifyLabel = verifyBtn ? (verifyBtn.innerText || verifyBtn.value || 'Verify').trim() : '';
        const errSelectMore = document.querySelector('.rc-imageselect-error-select-more');
        const errDynamicMore = document.querySelector('.rc-imageselect-error-dynamic-more');
        const errIncorrect = document.querySelector('.rc-imageselect-incorrect-response');
        const hasError = [errSelectMore, errDynamicMore, errIncorrect].some(e => e && e.style.display !== 'none' && (e.innerText || '').trim().length > 0);
        const tEl = document.querySelector('#rc-imageselect-target');
        const tr = tEl ? tEl.getBoundingClientRect() : null;
        return {
          promptText,
          target,
          tileCount: tiles.length,
          gridSize: is4x4 ? 4 : 3,
          isDynamic,
          verifyLabel,
          hasError,
          targetRect: tr && tr.width >= 200 && tr.height >= 200 ? { x: tr.x, y: tr.y, width: tr.width, height: tr.height } : null
        };
      })()`,
    );

    if (!bfInfo || !bfInfo.tileCount) {
      await sleep(1200);
      continue;
    }

    const gridSize = bfInfo.gridSize || 3;
    const targetPrompt = bfInfo.target || bfInfo.promptText || "matching objects";

    // Capture screenshot of #rc-imageselect-target (or full bframe rectangle as fallback)
    const rect = geo.bframeRect;
    const tr = bfInfo.targetRect;
    const gridClip = tr
      ? {
          x: Math.max(0, Math.round(rect.x + tr.x)),
          y: Math.max(0, Math.round(rect.y + tr.y)),
          width: Math.round(tr.width),
          height: Math.round(tr.height),
          scale: 1,
        }
      : {
          x: Math.max(0, Math.round(rect.x)),
          y: Math.max(0, Math.round(rect.y)),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          scale: 1,
        };
    const takeNumberedCdpGridShot = async () => {
      await evalInFrameViaIsolatedWorld(
        cdpSend,
        curBframe.id,
        `(() => {
          const tiles = Array.from(document.querySelectorAll('.rc-imageselect-tile, td[role="button"]'));
          tiles.forEach((td, i) => {
            if (getComputedStyle(td).position === 'static') td.style.position = 'relative';
            let b = td.querySelector('.__rc_num_badge');
            if (!b) {
              b = document.createElement('div');
              b.className = '__rc_num_badge';
              b.style.cssText = 'position:absolute;top:2px;left:2px;z-index:999999;background:rgba(220,0,0,0.9);color:#fff;font:bold 15px/18px Arial,sans-serif;padding:1px 5px;border-radius:3px;border:1px solid #fff;pointer-events:none;';
              td.appendChild(b);
            }
            b.textContent = String(i + 1);
          });
        })()`,
      ).catch(() => {});
      const s = await cdpSend("Page.captureScreenshot", {
        format: "png",
        clip: gridClip,
      }).catch(() => null);
      await evalInFrameViaIsolatedWorld(
        cdpSend,
        curBframe.id,
        `(() => {
          document.querySelectorAll('.__rc_num_badge').forEach((el) => el.remove());
        })()`,
      ).catch(() => {});
      return s;
    };

    const shot = await takeNumberedCdpGridShot();

    if (!shot?.data) {
      onLog?.("warn", `Unable to capture reCAPTCHA bframe screenshot on round ${round}`);
      await sleep(1000);
      continue;
    }

    const vision = await askVisionForRecaptchaTiles(shot.data, targetPrompt, gridSize, {
      fetchFn,
      routerConfig,
    });

    onLog?.(
      "info",
      `[reCAPTCHA Vision R${round} via ${vision.model || "vision"}] target="${targetPrompt}" (${gridSize}x${gridSize} dynamic=${bfInfo.isDynamic}) -> tiles=[${(vision.tiles || []).join(",")}]`,
    );

    const clickCdpTileTrusted = async (idx0) => {
      const tilePt = await evalInFrameViaIsolatedWorld(
        cdpSend,
        curBframe.id,
        `(() => {
          const tiles = Array.from(document.querySelectorAll('.rc-imageselect-tile, td[role="button"]'));
          const t = tiles[${idx0}];
          if (!t || t.classList.contains('rc-imageselect-tileselected')) return null;
          const r = t.getBoundingClientRect();
          if (r.width > 5 && r.height > 5) {
            return { cx: r.x + r.width * (0.35 + Math.random() * 0.3), cy: r.y + r.height * (0.35 + Math.random() * 0.3) };
          }
          t.click();
          return { clickedDom: true };
        })()`,
      );
      if (tilePt && typeof tilePt.cx === "number" && rect) {
        await cdpClickPoint(cdpSend, rect.x + tilePt.cx, rect.y + tilePt.cy);
      }
    };

    if (Array.isArray(vision.tiles) && vision.tiles.length > 0) {
      let lastClickedSet = new Set(vision.tiles);
      for (const tileNum of vision.tiles) {
        await clickCdpTileTrusted(tileNum - 1);
        await sleep(200 + Math.floor(Math.random() * 140));
      }

      if (bfInfo.isDynamic) {
        // Wait for dynamic fade-in replacement tiles and do up to 4 sub-passes before clicking Verify
        for (let dynPass = 1; dynPass <= 4; dynPass += 1) {
          await sleep(4300);
          const subShot = await takeNumberedCdpGridShot();
          if (!subShot?.data) break;
          const subVision = await askVisionForRecaptchaTiles(subShot.data, targetPrompt, gridSize, {
            fetchFn,
            routerConfig,
          });
          const newTiles = Array.isArray(subVision.tiles) ? subVision.tiles : [];
          onLog?.(
            "info",
            `[reCAPTCHA Dynamic SubPass ${dynPass} via ${subVision.model || "vision"}] target="${targetPrompt}" -> tiles=[${newTiles.join(",")}]`,
          );
          if (newTiles.length === 0) break;
          for (const tNum of newTiles) {
            await clickCdpTileTrusted(tNum - 1);
            await sleep(220 + Math.floor(Math.random() * 120));
          }
          if (dynPass === 4) {
            await sleep(4300);
          }
        }
      }
    }

    // Click Verify / Next / Skip inside bframe via trusted coordinates first
    const verifyPt = await evalInFrameViaIsolatedWorld(
      cdpSend,
      curBframe.id,
      `(() => {
        const btn = document.querySelector('#recaptcha-verify-button');
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        if (r.width > 5 && r.height > 5) {
          return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
        }
        btn.click();
        return { clickedDom: true };
      })()`,
    );
    if (verifyPt && typeof verifyPt.cx === "number" && rect) {
      await cdpClickPoint(cdpSend, rect.x + verifyPt.cx, rect.y + verifyPt.cy);
    }
    await sleep(2400);

    // If reCAPTCHA says "Please select all matching images" (error-select-more), request a fresh grid if stuck
    const postErr = await evalInFrameViaIsolatedWorld(
      cdpSend,
      curBframe.id,
      `(() => {
        const errSelectMore = document.querySelector('.rc-imageselect-error-select-more');
        const errDynamicMore = document.querySelector('.rc-imageselect-error-dynamic-more');
        const stuck = [errSelectMore, errDynamicMore].some(e => e && e.style.display !== 'none' && (e.innerText || '').trim().length > 0);
        if (stuck) {
          const reloadBtn = document.querySelector('#recaptcha-reload-button');
          if (reloadBtn) reloadBtn.click();
          return true;
        }
        return false;
      })()`,
    );
    if (postErr) {
      await sleep(1800);
    }
  }

  // Final check after loop
  const finalTree = await cdpSend("Page.getFrameTree").catch(() => null);
  const { anchorFrame: finalAnchor } = findRecaptchaFramesInTree(finalTree?.frameTree);
  if (finalAnchor) {
    const aCheck = await evalInFrameViaIsolatedWorld(
      cdpSend,
      finalAnchor.id,
      `(() => {
        const el = document.querySelector('#recaptcha-anchor');
        return el ? el.getAttribute('aria-checked') === 'true' : false;
      })()`,
    );
    if (aCheck) {
      if (clickPageNextOnSolve) {
        await clickMainPageNextButton(cdpSend);
        await sleep(2200);
      }
      return { ok: true, solved: true, rounds: maxRounds, reason: "anchor_checked_final" };
    }
  }

  const finalGeo = await inspectMainPageRecaptchaGeometry(cdpSend);
  if (finalGeo?.url && !/challenge\/recaptcha|recaptcha\/(?:api2|enterprise)/i.test(finalGeo.url) && !finalGeo?.hasBframe) {
    return { ok: true, solved: true, rounds: maxRounds, reason: "navigated_past_recaptcha_final" };
  }

  return { ok: false, solved: false, rounds: maxRounds, reason: "max_rounds_exceeded" };
}

/**
 * Playwright Page wrapper for `solveGoogleRecaptchaViaCdp` (`ok 2`).
 * Attaches a temporary CDPSession to `page`, runs the Vision solver, and detaches cleanly.
 */
async function solveGoogleRecaptchaOnPlaywrightPage(page, options = {}) {
  if (!page || typeof page.context !== "function") {
    return { ok: false, solved: false, reason: "invalid_playwright_page" };
  }
  const {
    maxRounds = 8,
    onLog = null,
    fetchFn = fetch,
    routerConfig = null,
    clickPageNextOnSolve = true,
  } = options;

  if (typeof page.frames === "function") {
    try {
      const getFrames = () => {
        const all = page.frames();
        const anchorFrames = all.filter((f) => /recaptcha\/(?:api2|enterprise)\/anchor/i.test(f.url()));
        const anchorFrame = anchorFrames.length > 0 ? anchorFrames[anchorFrames.length - 1] : null;
        const bframes = all.filter((f) => /recaptcha\/(?:api2|enterprise)\/bframe/i.test(f.url()));
        const bframe = bframes.length > 0 ? bframes[bframes.length - 1] : null;
        return { anchorFrame, anchorFrames, bframe, bframes };
      };

      const isAnyAnchorChecked = async () => {
        const mainToken = await page
          .evaluate(() => {
            const ta = document.querySelector('textarea[name="g-recaptcha-response"], [id^="g-recaptcha-response"]');
            return Boolean(ta && (ta.value || "").trim().length > 20);
          })
          .catch(() => false);
        if (mainToken) return true;
        const { anchorFrames } = getFrames();
        for (const af of anchorFrames) {
          const c = await af
            .evaluate(() => {
              const el = document.querySelector("#recaptcha-anchor");
              return Boolean(
                el &&
                  (el.getAttribute("aria-checked") === "true" ||
                    el.classList.contains("recaptcha-checkbox-checked")),
              );
            })
            .catch(() => false);
          if (c) return true;
        }
        return false;
      };

      const isBframeIframeVisibleOnPage = async () =>
        page
          .evaluate(() => {
            const iframes = Array.from(document.querySelectorAll('iframe[src*="recaptcha"][src*="bframe"]'));
            return iframes.some((f) => {
              const r = f.getBoundingClientRect();
              const cs = window.getComputedStyle(f);
              let p = f.parentElement;
              while (p && p !== document.documentElement) {
                const pcs = window.getComputedStyle(p);
                if (pcs.visibility === "hidden" || pcs.display === "none" || parseFloat(pcs.opacity || "1") === 0) {
                  return false;
                }
                p = p.parentElement;
              }
              return r.width >= 220 && r.height >= 220 && r.top >= -50 && cs.visibility !== "hidden" && cs.display !== "none";
            });
          })
          .catch(() => false);

      const clickFrameLocatorViaMouseBox = async (loc) => {
        if (!loc || typeof loc.boundingBox !== "function" || !page?.mouse) return false;
        const box = await loc.boundingBox({ timeout: 2200 }).catch(() => null);
        if (!box || box.width <= 4 || box.height <= 4) return false;
        const cx = box.x + box.width * (0.35 + Math.random() * 0.3);
        const cy = box.y + box.height * (0.35 + Math.random() * 0.3);
        await page.mouse.move(cx, cy, { steps: 4 }).catch(() => {});
        await sleep(30 + Math.floor(Math.random() * 35));
        await page.mouse.down().catch(() => {});
        await sleep(45 + Math.floor(Math.random() * 45));
        await page.mouse.up().catch(() => {});
        return true;
      };

      const clickMainNextIfNeeded = async () => {
        if (clickPageNextOnSolve && typeof page.locator === "function") {
          const nextLoc = page
            .locator(
              '#recaptchaNext button:visible, #recaptchaNext:visible, #identifierNext button:visible, #identifierNext:visible, #passwordNext button:visible, #totpNext button:visible, button[jsname="LgbsSe"]:visible, button:has-text("Next"):visible, button:has-text("Tiếp theo"):visible',
            )
            .first();
          await nextLoc.click({ timeout: 2500 }).catch(async () => {
            await clickFrameLocatorViaMouseBox(nextLoc);
          });
          await sleep(2500);
        }
      };

      let { anchorFrame: a0, anchorFrames: aList0 } = getFrames();
      for (let waitIdx = 0; !a0 && waitIdx < 8; waitIdx += 1) {
        await sleep(600);
        ({ anchorFrame: a0, anchorFrames: aList0 } = getFrames());
      }
      const clickAnchorCheckboxIfPresent = async () => {
        const { anchorFrame: curAnchor, anchorFrames: curAnchorList } = getFrames();
        if (!curAnchor) return false;
        if (await isAnyAnchorChecked()) return false;
        if (await isBframeIframeVisibleOnPage()) return false;
        let clicked = false;
        for (const af of [...curAnchorList].reverse()) {
          const ok = await af
            .evaluate(() => {
              const el = document.querySelector("#recaptcha-anchor");
              if (!el) return false;
              const r = el.getBoundingClientRect();
              if (r.width <= 0 || r.height <= 0) return false;
              el.click();
              return true;
            })
            .catch(() => false);
          if (ok) {
            clicked = true;
            break;
          }
        }
        if (!clicked) {
          await curAnchor.evaluate(() => document.querySelector("#recaptcha-anchor")?.click()).catch(() => {});
        }
        onLog?.("info", "Clicked reCAPTCHA anchor checkbox via Playwright frame");
        for (let w = 0; w < 6; w += 1) {
          await sleep(700);
          if ((await isAnyAnchorChecked()) || (await isBframeIframeVisibleOnPage())) break;
        }
        return true;
      };
      if (a0) {
        await clickAnchorCheckboxIfPresent();
      }

      let emptyTileStreak = 0;
      for (let round = 1; round <= maxRounds; round += 1) {
        const curUrl = typeof page.url === "function" ? page.url() : "";
        const { anchorFrame, bframe: lastBframe, bframes } = getFrames();

        if (await isAnyAnchorChecked()) {
          onLog?.("success", `reCAPTCHA solved (aria-checked=true) at round ${round}`);
          await clickMainNextIfNeeded();
          return { ok: true, solved: true, rounds: round - 1, reason: "anchor_checked" };
        }

        if (curUrl && !/challenge\/recaptcha|recaptcha\/(?:api2|enterprise)/i.test(curUrl) && !anchorFrame && !lastBframe) {
          return { ok: true, solved: true, rounds: round - 1, reason: "navigated_past_recaptcha" };
        }

        if (!bframes || bframes.length === 0) {
          await clickAnchorCheckboxIfPresent();
          await sleep(1200);
          continue;
        }

        let bframe = lastBframe;
        let bfInfo = null;
        for (const candBf of [...bframes].reverse()) {
          const info = await candBf
            .evaluate(() => {
              const bodyTxt = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
              const isDoscaptcha =
                Boolean(document.querySelector(".rc-doscaptcha-header")) ||
                /Try again later|automated queries|truy v\u1ea5n t\u1ef1 \u0111\u1ed9ng|Th\u1eed l\u1ea1i sau/i.test(bodyTxt);
              const descEl = document.querySelector(
                ".rc-imageselect-desc-no-canonical, .rc-imageselect-desc, #rc-imageselect .rc-imageselect-instructions",
              );
              const strongEl = descEl ? descEl.querySelector("strong") : null;
              const promptText = descEl ? (descEl.innerText || "").replace(/\s+/g, " ").trim() : "";
              const target = strongEl ? (strongEl.innerText || "").trim() : promptText;
              const tiles = Array.from(document.querySelectorAll('.rc-imageselect-tile, td[role="button"]'));
              const is4x4 = Boolean(document.querySelector(".rc-imageselect-table-44")) || tiles.length === 16;
              const isDynamic = /none left|click verify once there are none|kh\u00f4ng c\u00f2n h\u00ecnh \u1ea3nh n\u00e0o|khi kh\u00f4ng c\u00f2n|h\u1ebft h\u00ecnh/i.test(promptText) || Boolean(document.querySelector('.rc-imageselect-dynamic-selected'));
              return {
                bodyTxt: bodyTxt.slice(0, 180),
                promptText,
                target,
                tileCount: tiles.length,
                gridSize: is4x4 ? 4 : 3,
                isDynamic,
                isDoscaptcha,
              };
            })
            .catch(() => null);
          if (info?.isDoscaptcha || (info && info.tileCount > 0)) {
            bframe = candBf;
            bfInfo = info;
            break;
          }
          if (!bfInfo && info) {
            bframe = candBf;
            bfInfo = info;
          }
        }

        if (bfInfo?.isDoscaptcha) {
          onLog?.("warn", "[reCAPTCHA] Google doscaptcha ('Try again later') detected on current proxy IP — exiting early for IP rotation");
          return { ok: false, solved: false, rounds: round, reason: "doscaptcha_blocked" };
        }

        if (!bfInfo || !bfInfo.tileCount) {
          if (await isAnyAnchorChecked()) {
            onLog?.("success", `reCAPTCHA solved (aria-checked=true) at round ${round}`);
            await clickMainNextIfNeeded();
            return { ok: true, solved: true, rounds: round - 1, reason: "anchor_checked" };
          }
          const postVerifyUrl = typeof page.url === "function" ? page.url() : "";
          if (postVerifyUrl && !/challenge\/recaptcha|recaptcha\/(?:api2|enterprise)/i.test(postVerifyUrl)) {
            return { ok: true, solved: true, rounds: round - 1, reason: "navigated_past_recaptcha" };
          }
          const bframeVis = await isBframeIframeVisibleOnPage();
          onLog?.(
            "info",
            `[reCAPTCHA R${round}] empty tiles (streak=${emptyTileStreak + 1}): bframeVis=${bframeVis} body=${JSON.stringify(bfInfo?.bodyTxt || "")}`,
          );
          if (!bframeVis && round > 1) {
            await clickMainNextIfNeeded();
            const afterNextUrl = typeof page.url === "function" ? page.url() : "";
            if (afterNextUrl && !/challenge\/recaptcha|recaptcha\/(?:api2|enterprise)/i.test(afterNextUrl)) {
              onLog?.("success", `reCAPTCHA advanced past /challenge/recaptcha after bframe closed on round ${round}`);
              return { ok: true, solved: true, rounds: round - 1, reason: "bframe_closed_advanced" };
            }
          }
          emptyTileStreak += 1;
          if (emptyTileStreak >= 3) {
            onLog?.("warn", "[reCAPTCHA] bframe failed to load image tiles after 3 consecutive attempts — exiting early for IP rotation");
            return { ok: false, solved: false, rounds: round, reason: "doscaptcha_blocked" };
          }
          if (bframe && bframeVis) {
            await bframe
              .evaluate(() => {
                const btn = document.querySelector("#recaptcha-image-button, #recaptcha-reload-button");
                if (btn) btn.click();
              })
              .catch(() => {});
            await sleep(1800);
          } else {
            await clickAnchorCheckboxIfPresent();
            await sleep(1200);
          }
          continue;
        }
        emptyTileStreak = 0;

        const gridSize = bfInfo.gridSize || 3;
        const targetPrompt = bfInfo.target || bfInfo.promptText || "matching objects";
        const targetLoc = bframe.locator("#rc-imageselect-target, #rc-imageselect").first();
        const takeNumberedGridShot = async () => {
          if (!(await isBframeIframeVisibleOnPage())) return null;
          await bframe
            .evaluate(() => {
              const tiles = Array.from(document.querySelectorAll('.rc-imageselect-tile, td[role="button"]'));
              tiles.forEach((td, i) => {
                td.style.position = "relative";
                let badge = td.querySelector(".__rc_num_badge");
                if (!badge) {
                  badge = document.createElement("div");
                  badge.className = "__rc_num_badge";
                  badge.style.cssText =
                    "position:absolute;top:2px;left:2px;z-index:9999;background:rgba(220,0,0,0.88);color:#fff;font:bold 13px/15px Arial,sans-serif;padding:1px 4px;border-radius:3px;pointer-events:none;";
                  td.appendChild(badge);
                }
                badge.textContent = String(i + 1);
              });
            })
            .catch(() => {});
          const buf = await targetLoc.screenshot({ type: "png", timeout: 4000 }).catch(() => null);
          await bframe
            .evaluate(() => {
              document.querySelectorAll(".__rc_num_badge").forEach((el) => el.remove());
            })
            .catch(() => {});
          return buf;
        };
        const shotBuf = await takeNumberedGridShot();
        if (!shotBuf) {
          if (await isAnyAnchorChecked()) {
            onLog?.("success", `reCAPTCHA bframe closed / solved at round ${round}`);
            await clickMainNextIfNeeded();
            return { ok: true, solved: true, rounds: round - 1, reason: "bframe_closed_solved" };
          }
          await clickAnchorCheckboxIfPresent();
          await sleep(1000);
          continue;
        }

        const vision = await askVisionForRecaptchaTiles(shotBuf.toString("base64"), targetPrompt, gridSize, {
          fetchFn,
          routerConfig,
        });
        onLog?.(
          "info",
          `[reCAPTCHA R${round} via ${vision.model || "vision"}] target="${targetPrompt}" (${gridSize}x${gridSize} dyn=${bfInfo.isDynamic}) -> tiles=[${(vision.tiles || []).join(",")}]`,
        );
        if (!vision.ok) {
          return { ok: false, solved: false, rounds: round, reason: vision.error || "vision_quota_cooldown" };
        }

        const clickTileTrusted = async (idx0) => {
          await bframe
            .evaluate((i) => {
              const tiles = Array.from(document.querySelectorAll('.rc-imageselect-tile, td[role="button"]'));
              const el = tiles[i];
              if (!el || el.classList.contains("rc-imageselect-tileselected")) return false;
              el.click();
              return true;
            }, idx0)
            .catch(() => {});
        };

        if (Array.isArray(vision.tiles) && vision.tiles.length > 0) {
          for (const tileNum of vision.tiles) {
            await clickTileTrusted(tileNum - 1);
            await sleep(210 + Math.floor(Math.random() * 140));
          }

          const hasDynamicClass = await bframe
            .evaluate(() => Boolean(document.querySelector(".rc-imageselect-dynamic-selected")))
            .catch(() => false);
          if (bfInfo.isDynamic || hasDynamicClass) {
            let lastClickedSet = new Set(vision.tiles);
            for (let dynPass = 1; dynPass <= 4; dynPass += 1) {
              await sleep(4300);
              const subBuf = await takeNumberedGridShot();
              if (!subBuf) break;
              const subVision = await askVisionForRecaptchaTiles(subBuf.toString("base64"), targetPrompt, gridSize, {
                fetchFn,
                routerConfig,
              });
              const newlyMatched = Array.isArray(subVision.tiles) ? subVision.tiles : [];
              onLog?.(
                "info",
                `[reCAPTCHA Dyn${dynPass}] target="${targetPrompt}" -> tiles=[${newlyMatched.join(",")}]`,
              );
              if (newlyMatched.length === 0) break;
              for (const tNum of newlyMatched) {
                await clickTileTrusted(tNum - 1);
                await sleep(220 + Math.floor(Math.random() * 120));
              }
              if (dynPass === 4) {
                await sleep(4300);
              }
            }
          }
        }

        await bframe
          .evaluate(() => {
            const btn = document.querySelector("#recaptcha-verify-button");
            if (btn) btn.click();
          })
          .catch(() => {});
        await sleep(2400);

        if (await isAnyAnchorChecked()) {
          onLog?.("success", `reCAPTCHA solved (aria-checked=true) after verify on round ${round}`);
          await clickMainNextIfNeeded();
          return { ok: true, solved: true, rounds: round, reason: "anchor_checked_after_verify" };
        }

        // Only attempt Audio Challenge when explicitly opted in (`options.tryAudioFallback === true`),
        // because clicking `#recaptcha-audio-button` on Google reCAPTCHA v2 triggers `.rc-doscaptcha-header`
        // and destroys active multi-round image grid challenges.
        if (options.tryAudioFallback === true && round >= maxRounds && bframe) {
          try {
            const audioOutcome = await bframe
              .evaluate(async () => {
                const existingSrc =
                  document.querySelector(".rc-audiochallenge-tdownload-link")?.getAttribute("href") ||
                  document.querySelector("audio#audio-source")?.getAttribute("src") ||
                  "";
                if (existingSrc) return { audioUrl: existingSrc };
                const audioBtn = document.querySelector("#recaptcha-audio-button");
                if (!audioBtn) return { audioUrl: "" };
                const r = audioBtn.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) return { audioUrl: "" };
                audioBtn.click();
                await new Promise((res) => setTimeout(res, 1800));
                if (
                  document.querySelector(".rc-doscaptcha-header, .rc-doscaptcha-header-text") ||
                  /Try again later|automated queries|truy v\u1ea5n t\u1ef1 \u0111\u1ed9ng/i.test(document.body?.innerText || "")
                ) {
                  document.querySelector("#recaptcha-image-button, #recaptcha-reload-button")?.click();
                  return { doscaptcha: true, audioUrl: "" };
                }
                return {
                  audioUrl:
                    document.querySelector(".rc-audiochallenge-tdownload-link")?.getAttribute("href") ||
                    document.querySelector("audio#audio-source")?.getAttribute("src") ||
                    "",
                };
              })
              .catch(() => ({ audioUrl: "" }));
            if (audioOutcome?.doscaptcha) {
              onLog?.("warn", "[reCAPTCHA Audio] doscaptcha detected — switching back to image grid / proxy rotation");
            } else if (audioOutcome?.audioUrl && String(audioOutcome.audioUrl).startsWith("http")) {
              const cfg = routerConfig || loadRouterConfig();
              const baseUrl = String(cfg.baseUrl || "https://9router.infi28.com/v1").replace(/\/+$/, "");
              const apiKey = cfg.apiKey || "sk-uer05xqnhp3s2ii0-7p7jal-a3b87e60";
              const audioRes = await fetchFn(audioOutcome.audioUrl, { signal: AbortSignal.timeout(8000) }).catch(() => null);
              if (audioRes?.ok && apiKey) {
                const audioB64 = Buffer.from(await audioRes.arrayBuffer()).toString("base64");
                for (const sttModel of ["ag/gemini-3-flash", "ag/gemini-2.5-flash"]) {
                  const sttRes = await fetchFn(`${baseUrl}/chat/completions`, {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${apiKey}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      model: sttModel,
                      temperature: 0,
                      max_tokens: 60,
                      messages: [
                        {
                          role: "user",
                          content: [
                            {
                              type: "text",
                              text: "Accessibility speech-to-text task: Transcribe the spoken English words in this short noisy audio recording. Output ONLY the exact lowercase words separated by spaces, with no punctuation or commentary.",
                            },
                            {
                              type: "image_url",
                              image_url: { url: `data:audio/mp3;base64,${audioB64}` },
                            },
                          ],
                        },
                      ],
                    }),
                    signal: AbortSignal.timeout(12000),
                  }).catch(() => null);
                  if (!sttRes?.ok) continue;
                  const rawStt = extractVisionResponseText(await sttRes.text().catch(() => ""));
                  const transcript = String(rawStt || "")
                    .toLowerCase()
                    .replace(/[^a-z0-9\s]/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();
                  if (transcript.length >= 3 && transcript.length <= 80) {
                    const submittedAudio = await bframe
                      .evaluate((words) => {
                        const inp = document.querySelector("#audio-response");
                        if (!inp) return false;
                        inp.focus();
                        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                        if (setter) setter.call(inp, words);
                        else inp.value = words;
                        inp.dispatchEvent(new Event("input", { bubbles: true }));
                        inp.dispatchEvent(new Event("change", { bubbles: true }));
                        document.querySelector("#recaptcha-verify-button")?.click();
                        return true;
                      }, transcript)
                      .catch(() => false);
                    if (submittedAudio) {
                      onLog?.("info", `[reCAPTCHA Audio via ${sttModel}] Submitted transcript="${transcript}" on round ${round}`);
                      await sleep(2400);
                      if (await isAnyAnchorChecked()) {
                        onLog?.("success", `reCAPTCHA solved via Audio Challenge on round ${round}`);
                        await clickMainNextIfNeeded();
                        return { ok: true, solved: true, rounds: round, reason: "audio_challenge_solved" };
                      }
                      // Switch back to image grid if audio did not check anchor
                      await bframe.evaluate(() => document.querySelector("#recaptcha-image-button")?.click()).catch(() => {});
                      await sleep(1200);
                    }
                    break;
                  }
                }
              }
            }
          } catch {
            /* ignore audio challenge fallback errors */
          }
        }

        const postErr = await bframe
          .evaluate(() => {
            const errSelectMore = document.querySelector(".rc-imageselect-error-select-more");
            const errDynamicMore = document.querySelector(".rc-imageselect-error-dynamic-more");
            const stuck = [errSelectMore, errDynamicMore].some(
              (e) => e && e.style.display !== "none" && (e.innerText || "").trim().length > 0,
            );
            if (stuck) {
              document.querySelector("#recaptcha-reload-button")?.click();
              return true;
            }
            return false;
          })
          .catch(() => false);
        if (postErr) await sleep(1600);
      }

      if (await isAnyAnchorChecked()) {
        await clickMainNextIfNeeded();
        return { ok: true, solved: true, rounds: maxRounds, reason: "anchor_checked_final" };
      }
      return { ok: false, solved: false, rounds: maxRounds, reason: "max_rounds_exceeded" };
    } catch (err) {
      return {
        ok: false,
        solved: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const ctx = page.context();
  if (!ctx || typeof ctx.newCDPSession !== "function") {
    return { ok: false, solved: false, reason: "cdp_session_unsupported" };
  }
  let cdp = null;
  try {
    cdp = await ctx.newCDPSession(page);
    const cdpSend = (method, params = {}) => cdp.send(method, params);
    return await solveGoogleRecaptchaViaCdp(cdpSend, options);
  } catch (err) {
    return {
      ok: false,
      solved: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (cdp) {
      await cdp.detach().catch(() => undefined);
    }
  }
}

/**
 * Matches a Google masked recovery email hint (e.g. `"ran•••••@gmail.com"` or `"Get a verification code at ran•••••"`)
 * against known `mailRecover` and candidate email addresses (`ok 1`).
 */
function matchMaskedRecoveryEmail(maskedText = "", candidates = [], options = {}) {
  const cleanText = String(maskedText || "").trim();
  const excludeEmail = String(options?.excludeEmail || "").trim().toLowerCase();
  const preferredEmail = String(options?.preferredEmail || "").trim().toLowerCase();
  const [excludeLocal = "", excludeDom = ""] = excludeEmail.includes("@") ? excludeEmail.split("@") : ["", ""];
  const excludePref2 = excludeLocal.slice(0, 2);

  const list = Array.from(
    new Set(
      (Array.isArray(candidates) ? candidates : [candidates])
        .map((c) => String(c || "").trim().toLowerCase())
        .filter((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) && c !== excludeEmail),
    ),
  );
  if (list.length === 0) return { matched: "", prefix: "", domain: "", candidatesChecked: 0 };

  // Extract all masked patterns like "ran•••••@gmail.com" or "q2•••@outlook.com"
  const allMaskMatches = Array.from(
    cleanText.matchAll(/\b([a-z0-9._+-]{1,12})[•*?\uFFFD\u2022]+(?:@([a-z0-9.-]+\.[a-z]{2,}))?/gi),
  );
  if (allMaskMatches.length === 0) {
    return { matched: preferredEmail || list[0], prefix: "", domain: "", candidatesChecked: list.length };
  }

  // Filter out masked patterns that clearly belong to the target account itself (e.g. ch••••••@gmail.com for chino884@gmail.com)
  const validMasks = allMaskMatches
    .map((m) => ({
      prefix: String(m[1] || "").toLowerCase(),
      domain: String(m[2] || "").toLowerCase(),
    }))
    .filter((m) => {
      if (!excludePref2) return true;
      const samePrefix = excludeLocal.startsWith(m.prefix) || m.prefix.startsWith(excludePref2);
      const sameDomain = !m.domain || !excludeDom || m.domain === excludeDom;
      if (samePrefix && sameDomain && (!preferredEmail || !preferredEmail.startsWith(m.prefix))) {
        return false;
      }
      return true;
    });

  const masksToSearch = validMasks.length > 0 ? validMasks : allMaskMatches.map((m) => ({
    prefix: String(m[1] || "").toLowerCase(),
    domain: String(m[2] || "").toLowerCase(),
  }));

  // 1. Check preferredEmail (`mailRecover`) first against any mask on screen
  if (preferredEmail && preferredEmail.includes("@")) {
    const [pLocal, pDom] = preferredEmail.split("@");
    for (const m of masksToSearch) {
      if (pLocal.startsWith(m.prefix) && (!m.domain || pDom === m.domain)) {
        return { matched: preferredEmail, prefix: m.prefix, domain: m.domain, candidatesChecked: list.length };
      }
    }
  }

  // 2. Otherwise match against candidate list
  for (const m of masksToSearch) {
    for (const email of list) {
      const [localPart, domPart] = email.split("@");
      if (!localPart.startsWith(m.prefix)) continue;
      if (m.domain && domPart !== m.domain) continue;
      return { matched: email, prefix: m.prefix, domain: m.domain, candidatesChecked: list.length };
    }
  }

  const firstMask = masksToSearch[0] || { prefix: "", domain: "" };
  return { matched: "", prefix: firstMask.prefix, domain: firstMask.domain, candidatesChecked: list.length };
}

/**
 * Handles Google Recovery Email Challenge (`/v3/signin/challenge/selection`, `/challenge/kpe`, `/challenge/ipe`) (`ok 1`).
 *  - Case A (`kpe` — "Confirm your recovery email"): types the full recovery email address and submits.
 *  - Case B (`ipe` / `ootp` — "Get a verification code at ..."): selects the option, confirms email if prompted,
 *    and polls `pollRecoveryCodeFn(matchedEmail)` for the 6-digit verification code.
 */
async function handleGoogleRecoveryEmailChallengeViaCdp(
  cdpSend,
  {
    mailRecover = "",
    targetAccount = "",
    candidateEmails = [],
    pollRecoveryCodeFn = null,
    onLog = null,
  } = {},
) {
  const allCandidates = [mailRecover, ...(Array.isArray(candidateEmails) ? candidateEmails : [])].filter(Boolean);
  const matchOpts = { excludeEmail: targetAccount, preferredEmail: mailRecover };

  const pageState = await evalInMainPage(
    cdpSend,
    `(() => {
      const url = location.href;
      const bodyText = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
      const items = Array.from(document.querySelectorAll('[data-challengetype], div[role="link"], li')).map(el => ({
        type: el.getAttribute('data-challengetype') || '',
        text: (el.innerText || '').replace(/\\s+/g, ' ').trim()
      })).filter(x => x.text.length > 0 && x.text.length < 200);
      return { url, bodyText: bodyText.slice(0, 600), items };
    })()`,
  );

  if (!pageState) return { ok: false, reason: "no_page_state" };
  const matchInfo = matchMaskedRecoveryEmail(pageState.bodyText, allCandidates, matchOpts);
  const selfAccountLower = String(targetAccount || "").trim().toLowerCase();
  const selfPref2 = selfAccountLower.includes("@") ? selfAccountLower.split("@")[0].slice(0, 2) : "";
  const selfDom = selfAccountLower.includes("@") ? selfAccountLower.split("@")[1] : "";
  const recLower = String(mailRecover || "").trim().toLowerCase();
  const recPref2 = recLower.includes("@") ? recLower.split("@")[0].slice(0, 2) : "";
  const recDom = recLower.includes("@") ? recLower.split("@")[1] : "";

  // Step 1: If on /challenge/selection, prefer "Confirm your recovery email" first, else "Get a verification code at <recovery>" (excluding target Gmail itself)
  if (/challenge\/selection/i.test(pageState.url)) {
    const clickedOption = await evalInMainPage(
      cdpSend,
      `((cfg) => {
        const items = Array.from(document.querySelectorAll('div[role="link"][data-challengetype], [data-challengetype], div[role="link"], li')).filter(
          el => el.offsetWidth > 0 && !el.querySelector('div[role="link"]') && (el.innerText || '').trim().length < 160
        );
        const isSelfMask = (txt) => {
          const t = String(txt || '').toLowerCase();
          if (cfg.selfAccountLower && t.includes(cfg.selfAccountLower)) return true;
          if (!cfg.selfPref2) return false;
          const m = t.match(/\\b([a-z0-9._+-]{1,12})[•*?\\uFFFD\\u2022]+(?:@([a-z0-9.-]+\\.[a-z]{2,}))?/i);
          if (!m) return false;
          const p = (m[1] || '').toLowerCase();
          const d = (m[2] || '').toLowerCase();
          return (cfg.selfAccountLower.startsWith(p) || p.startsWith(cfg.selfPref2)) && (!d || !cfg.selfDom || d === cfg.selfDom) && (!cfg.recPref2 || !p.startsWith(cfg.recPref2));
        };
        const confirmItem = items.find(el => /Confirm your recovery email|Xác nhận email khôi phục/i.test(el.innerText || ''));
        if (confirmItem) {
          const target = confirmItem.querySelector('div[role="link"]') || confirmItem;
          target.click();
          const r = target.getBoundingClientRect();
          return { action: 'confirm_email', text: (target.innerText || '').replace(/\\s+/g, ' ').trim(), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        }
        const codeItems = items.filter(el => /Get a verification code at|Nhận mã xác minh tại/i.test(el.innerText || ''));
        const preferredCodeItem =
          codeItems.find(el => {
            const t = (el.innerText || '').toLowerCase();
            if (isSelfMask(t)) return false;
            return (cfg.recDom && t.includes(cfg.recDom)) || (cfg.recPref2 && t.includes('at ' + cfg.recPref2));
          }) ||
          codeItems.find(el => !isSelfMask(el.innerText || ''));
        if (preferredCodeItem) {
          const target = preferredCodeItem.querySelector('div[role="link"]') || preferredCodeItem;
          target.click();
          const r = target.getBoundingClientRect();
          return { action: 'send_code', text: (target.innerText || '').replace(/\\s+/g, ' ').trim(), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        }
        return null;
      })(${JSON.stringify({ selfAccountLower, selfPref2, selfDom, recPref2, recDom })})`,
    );
    if (clickedOption?.action) {
      if (clickedOption.x > 0 && clickedOption.y > 0) {
        await cdpClickPoint(cdpSend, clickedOption.x, clickedOption.y).catch(() => {});
      }
      onLog?.(
        "info",
        `[RecoveryEmail] Clicked '${clickedOption.action}' ("${clickedOption.text || ""}") on /challenge/selection (prefix='${matchInfo.prefix}', matched='${matchInfo.matched || "none"}')`,
      );
      await sleep(3500);
    }
  }

  // Step 2: Check if Google is asking to type the recovery email address (`kpe` or pre-code confirmation) or click "Send" on `/challenge/ipe`
  const afterClickState = await evalInMainPage(
    cdpSend,
    `(() => {
      const url = location.href;
      const bodyText = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 600);
      const emailInput = document.querySelector('input#knowledge-preregistered-email-response, input[name="knowledgePreregisteredEmailResponse"], input[type="email"]');
      const codeInput = document.querySelector('input#idvPin, input[name="idvPin"], input[name="Pin"], input[type="tel"]');
      let clickedSend = false;
      if (!emailInput && !codeInput && /challenge\\/(?:ipe|ootp)/i.test(url)) {
        for (const b of document.querySelectorAll('button, div[role="button"]')) {
          if (b.offsetWidth === 0) continue;
          const t = (b.innerText || '').trim();
          if (/^(Send|Gửi)$/i.test(t)) {
            b.click();
            clickedSend = true;
            break;
          }
        }
      }
      return {
        url,
        bodyText,
        clickedSend,
        hasEmailInput: Boolean(emailInput && emailInput.offsetWidth > 0),
        hasCodeInput: Boolean(codeInput && codeInput.offsetWidth > 0)
      };
    })()`,
  );
  if (afterClickState?.clickedSend) {
    onLog?.("info", "[RecoveryEmail] Clicked 'Send' button on /challenge/ipe to trigger OTP email");
    await sleep(3500);
  }

  const updatedMatch = matchMaskedRecoveryEmail(
    afterClickState?.bodyText || pageState.bodyText,
    allCandidates,
    matchOpts,
  );
  const chosenEmail = updatedMatch.matched || String(mailRecover || "").trim().toLowerCase();

  if (afterClickState?.hasEmailInput && chosenEmail) {
    // If there is a masked prefix on screen and our chosenEmail does NOT match the prefix, log clearly
    if (updatedMatch.prefix && !chosenEmail.startsWith(updatedMatch.prefix)) {
      return {
        ok: false,
        reason: "recovery_email_mismatch",
        maskedPrefix: updatedMatch.prefix,
        maskedDomain: updatedMatch.domain,
        configuredRecover: mailRecover,
      };
    }
    await evalInMainPage(
      cdpSend,
      `((emailVal) => {
        const inp = document.querySelector('input#knowledge-preregistered-email-response, input[name="knowledgePreregisteredEmailResponse"], input[type="email"]');
        if (!inp) return false;
        inp.focus();
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(inp, emailVal);
        else inp.value = emailVal;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        const btn = document.querySelector('button[jsname="LgbsSe"], #idvPreregisteredEmailNext button, #idvPreregisteredEmailNext');
        if (btn) btn.click();
        return true;
      })(${JSON.stringify(chosenEmail)})`,
    );
    onLog?.("info", `[RecoveryEmail] Submitted recovery email address: ${chosenEmail}`);
    await sleep(3800);
  }

  // Step 3: Check if we are now on a 6-digit verification code input (`/challenge/ipe` or `/challenge/ootp`) or already advanced past recovery email challenge
  const postSubmit = await evalInMainPage(
    cdpSend,
    `(() => {
      const url = location.href;
      const bodyText = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 600);
      const codeInput = document.querySelector('input#idvPin, input[name="idvPin"], input[name="Pin"], input[type="tel"]');
      return {
        url,
        bodyText,
        hasCodeInput: Boolean(codeInput && codeInput.offsetWidth > 0)
      };
    })()`,
  );

  if (
    postSubmit?.url &&
    (!/accounts\.google\.com/i.test(postSubmit.url) ||
      /speedbump\/changepassword|signinoptions\/password/i.test(postSubmit.url) ||
      /Update password|Cập nhật mật khẩu|Change password|Đổi mật khẩu|Create a strong password/i.test(postSubmit.bodyText || ""))
  ) {
    return { ok: true, solved: true, method: "confirm_recovery_email", emailUsed: chosenEmail, url: postSubmit.url };
  }

  if (postSubmit?.hasCodeInput && typeof pollRecoveryCodeFn === "function" && chosenEmail) {
    if (updatedMatch.prefix && !chosenEmail.startsWith(updatedMatch.prefix)) {
      return {
        ok: false,
        reason: "recovery_email_mismatch_for_code",
        maskedPrefix: updatedMatch.prefix,
        configuredRecover: mailRecover,
      };
    }
    const codeRes = await pollRecoveryCodeFn(chosenEmail);
    if (codeRes?.ok && codeRes?.code) {
      await evalInMainPage(
        cdpSend,
        `((pinVal) => {
          const inp = document.querySelector('input#idvPin, input[name="idvPin"], input[name="Pin"], input[type="tel"]');
          if (!inp) return false;
          inp.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(inp, pinVal);
          else inp.value = pinVal;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          const btn = document.querySelector('#idvPreregisteredEmailNext button, #idvPreregisteredEmailNext, button[jsname="LgbsSe"]');
          if (btn) btn.click();
          return true;
        })(${JSON.stringify(String(codeRes.code).trim())})`,
      );
      await sleep(3800);
      return { ok: true, solved: true, method: "recovery_email_otp", emailUsed: chosenEmail, code: codeRes.code };
    }
    return { ok: false, reason: codeRes?.reason || "recovery_code_not_received", emailUsed: chosenEmail };
  }

  return {
    ok: false,
    reason: updatedMatch.prefix && !updatedMatch.matched ? "recovery_email_mismatch" : "recovery_challenge_unresolved",
    maskedPrefix: updatedMatch.prefix,
    maskedDomain: updatedMatch.domain,
    configuredRecover: mailRecover,
    url: postSubmit?.url || afterClickState?.url || pageState.url,
  };
}

/**
 * Decodes the Google QR Challenge (`/v3/signin/challenge/iap/qrcode`) via raw CDP (`cdpSend`)
 * and dispatches to `android-stealth-bridge.mjs` if an ADB device is online (`ok 3`).
 */
async function handleGoogleQrChallengeViaCdp(
  cdpSend,
  { code = "0001", onLog = null } = {},
) {
  const qrInfo = await evalInMainPage(
    cdpSend,
    `(async () => {
      let qrUrl = '';
      let qrImageBase64 = '';
      const html = String(document.documentElement?.innerHTML || '');
      const urlMatch = html.match(/https:\\/\\/(?:accounts\\.google\\.com\\/v3\\/signin\\/confirmqrcode|g\\.co\\/verifyaccount)[^\\s"'<>\\\\]+/i);
      if (urlMatch?.[0]) {
        qrUrl = urlMatch[0].replace(/\\\\u003d/g, '=').replace(/\\\\u0026/g, '&').replace(/&amp;/g, '&');
      }
      const qrImg = document.querySelector('img[src^="data:image/"], img[alt*="QR" i], img[src*="qrcode" i], [data-challengetype] img') ||
        Array.from(document.querySelectorAll('img')).find(el => {
          const r = el.getBoundingClientRect();
          return r.width >= 110 && r.width <= 360 && Math.abs(r.width - r.height) <= 24;
        });
      if (qrImg && qrImg.complete && qrImg.naturalWidth > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 320;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 320, 320);
        ctx.drawImage(qrImg, 20, 20, 280, 280);
        try {
          qrImageBase64 = canvas.toDataURL('image/png').replace(/^data:image\\/png;base64,/, '');
        } catch {}
        if (!qrUrl && typeof window.BarcodeDetector === 'function') {
          try {
            const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
            const barcodes = await detector.detect(canvas);
            if (Array.isArray(barcodes) && barcodes[0]?.rawValue) {
              qrUrl = String(barcodes[0].rawValue).trim();
            }
          } catch {}
        }
      }
      return {
        ok: Boolean(qrUrl || qrImageBase64),
        qrUrl,
        qrImageBase64,
        hasQrImage: Boolean(qrImageBase64),
        qrImageBase64Length: qrImageBase64.length
      };
    })()`,
  );

  if (qrInfo && !qrInfo.qrUrl && qrInfo.qrImageBase64) {
    try {
      const pathMod = require("node:path");
      const pnpmRoot = pathMod.resolve(__dirname, "../../../../node_modules/.pnpm");
      const { PNG } = require(pathMod.join(pnpmRoot, "pngjs@7.0.0/node_modules/pngjs"));
      const jsQR = require(pathMod.join(pnpmRoot, "jsqr@1.4.0/node_modules/jsqr"));
      const png = PNG.sync.read(Buffer.from(qrInfo.qrImageBase64, "base64"));
      const codeRes = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
      if (codeRes?.data) {
        qrInfo.qrUrl = String(codeRes.data).trim();
        onLog?.("info", `[QR Decoder #${code}] Decoded QR URL via jsQR: ${qrInfo.qrUrl.slice(0, 90)}`);
      }
    } catch (qrErr) {
      onLog?.("warn", `[QR Decoder #${code}] jsQR fallback error: ${qrErr?.message || qrErr}`);
    }
  }

  let bridgeStatus = null;
  try {
    const bridgeMod = await import("../../../P0002-Social-Hub/server/android-stealth-bridge.mjs");
    const nodeInfo = await bridgeMod.inspectAndProvisionMobileStealthNode({ provision: false });
    const identity = bridgeMod.generateAndroidAntidetectIdentity(code);
    let adbDispatch = {
      ok: false,
      reason: !(nodeInfo?.adbDevices?.length > 0) ? "no_adb_device_online" : "qr_url_not_decoded",
    };
    if (nodeInfo?.adbDevices?.length > 0 && qrInfo?.qrUrl) {
      adbDispatch = await bridgeMod.dispatchQrToConnectedAdbDevice(identity, {
        qrUrl: qrInfo.qrUrl,
        code,
        onLog,
      });
    }
    bridgeStatus = {
      ok: true,
      adbConnected: Boolean(nodeInfo?.adbDevices?.length > 0),
      adbDevices: nodeInfo?.adbDevices || [],
      iosWdaOnline: Boolean(nodeInfo?.iosWdaOnline),
      androidModel: identity.model,
      androidImei: identity.imei,
      adbDispatch,
    };
  } catch (err) {
    bridgeStatus = {
      ok: false,
      adbConnected: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  return {
    ok: Boolean(qrInfo?.ok),
    qrUrl: qrInfo?.qrUrl || "",
    hasQrImage: Boolean(qrInfo?.hasQrImage),
    bridgeStatus,
  };
}

/**
 * Recursively walks `Page.getFrameTree` to locate reCAPTCHA, Arkose FunCaptcha (Outlook/Hotmail),
 * and Facebook checkpoint captcha frames (`ok 3`).
 */
function findUniversalCaptchaFramesInTree(frameTree) {
  const { anchorFrame, bframe } = findRecaptchaFramesInTree(frameTree);
  let arkoseEnforcementFrame = null;
  let arkoseGameFrame = null;
  let facebookCaptchaFrame = null;

  const walk = (node) => {
    if (!node) return;
    const f = node.frame;
    const url = String(f?.url || "");
    const name = String(f?.name || "");
    if (url || name) {
      if (/fc\/gc\/|game-core-frame|arkoselabs\.com\/fc\/assets\/ec-game-core/i.test(`${url} ${name}`)) {
        arkoseGameFrame = f;
      } else if (/arkoselabs\.com|funcaptcha\.com|enforcementFrame/i.test(`${url} ${name}`)) {
        arkoseEnforcementFrame = f;
      }
      if (/fbsbx\.com\/captcha|facebook\.com\/captcha/i.test(url)) {
        facebookCaptchaFrame = f;
      }
    }
    if (Array.isArray(node.childFrames)) {
      for (const child of node.childFrames) walk(child);
    }
  };
  walk(frameTree);

  return {
    anchorFrame,
    bframe,
    arkoseEnforcementFrame,
    arkoseGameFrame,
    facebookCaptchaFrame,
  };
}

/**
 * Calls the Vision API (`ag/gemini-3.8-flash-low`) to solve Outlook/Hotmail Arkose FunCaptcha
 * (`arkose_tile` 6-tile grid or `arkose_arrows` rotation stepper) or Facebook/Microsoft `text_captcha`.
 */
async function askVisionForArkoseOrTextCaptcha(
  base64Png,
  puzzleType = "arkose_tile",
  promptText = "",
  { fetchFn = fetch, routerConfig = null, timeoutMs = 25000 } = {},
) {
  const cfg = routerConfig || loadRouterConfig();
  const baseUrl = String(cfg.baseUrl || "https://9router.infi28.com/v1").replace(/\/+$/, "");
  const apiKey = cfg.apiKey || "sk-uer05xqnhp3s2ii0-7p7jal-a3b87e60";
  const model = "ag/gemini-3-flash";

  let instruction = "";
  if (puzzleType === "arkose_tile") {
    instruction = [
      `You are solving a Microsoft Outlook / Arkose FunCaptcha 6-tile puzzle (3 columns x 2 rows: Row 1 is 1, 2, 3; Row 2 is 4, 5, 6).`,
      `Instruction on screen: "${promptText || "Pick the correct tile"}".`,
      `Return ONLY compact JSON with the 1-based tile number (1 to 6): {"mode":"tile","tile":2}`,
    ].join(" ");
  } else if (puzzleType === "arkose_arrows") {
    instruction = [
      `You are solving a Microsoft Outlook / Arkose FunCaptcha arrow-rotation / matching stepper puzzle.`,
      `Instruction on screen: "${promptText || "Rotate or match the object to the target orientation/count"}".`,
      `If the current image ALREADY matches the target orientation/count, return {"mode":"arrows","clicksRight":0,"readyToSubmit":true}.`,
      `Otherwise estimate how many clicks on the Right Arrow button (1 to 5) are needed to reach the matching orientation, and return ONLY compact JSON: {"mode":"arrows","clicksRight":1,"readyToSubmit":false}`,
    ].join(" ");
  } else {
    instruction = [
      `You are solving an alphanumeric image text CAPTCHA (Facebook checkpoint / Microsoft HIP).`,
      `Read the distorted characters in the image carefully (preserve case if obvious, no spaces).`,
      `Return ONLY compact JSON: {"mode":"text","text":"ABC123"}`,
    ].join(" ");
  }

  const res = await fetchFn(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.0,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instruction },
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${base64Png}` },
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, error: `vision_http_${res.status}:${errText.slice(0, 120)}` };
  }

  const rawBody = await res.text();
  const raw = extractVisionResponseText(rawBody);
  const jsonMatch = raw.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (puzzleType === "arkose_tile") {
        const tile = Number(parsed.tile);
        return {
          ok: Number.isInteger(tile) && tile >= 1 && tile <= 6,
          mode: "tile",
          tile: Number.isInteger(tile) ? tile : 1,
          raw,
        };
      }
      if (puzzleType === "arkose_arrows") {
        const clicksRight = Math.max(0, Math.min(6, Number(parsed.clicksRight) || 0));
        return {
          ok: true,
          mode: "arrows",
          clicksRight,
          readyToSubmit: Boolean(parsed.readyToSubmit || clicksRight === 0),
          raw,
        };
      }
      const text = String(parsed.text || "").trim();
      return { ok: Boolean(text), mode: "text", text, raw };
    } catch {
      /* fallback below */
    }
  }

  if (puzzleType === "arkose_tile") {
    const m = raw.match(/\b([1-6])\b/);
    return { ok: Boolean(m), mode: "tile", tile: m ? Number(m[1]) : 1, raw };
  }
  if (puzzleType === "arkose_arrows") {
    const m = raw.match(/\b([0-5])\b/);
    const clicks = m ? Number(m[1]) : 1;
    return { ok: true, mode: "arrows", clicksRight: clicks, readyToSubmit: clicks === 0, raw };
  }
  const cleanText = raw.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  return { ok: Boolean(cleanText), mode: "text", text: cleanText, raw };
}

/**
 * Solves Outlook/Hotmail Arkose FunCaptcha, Facebook Checkpoint Captcha (nested reCAPTCHA or text),
 * or Google reCAPTCHA via raw CDP (`cdpSend`) (`ok 3`).
 */
async function solveArkoseOrFacebookCaptchaViaCdp(
  cdpSend,
  {
    maxRounds = 8,
    onLog = null,
    fetchFn = fetch,
    routerConfig = null,
  } = {},
) {
  await cdpSend("Page.enable").catch(() => undefined);
  await cdpSend("Runtime.enable").catch(() => undefined);

  const treeRes = await cdpSend("Page.getFrameTree").catch(() => null);
  const frames = findUniversalCaptchaFramesInTree(treeRes?.frameTree);

  // 1. If Google reCAPTCHA anchor/bframe is present (including inside Facebook checkpoint), delegate to reCAPTCHA solver
  if (frames.anchorFrame || frames.bframe) {
    onLog?.("info", "Detected Google reCAPTCHA frame — delegating to solveGoogleRecaptchaViaCdp");
    return solveGoogleRecaptchaViaCdp(cdpSend, {
      maxRounds,
      onLog,
      fetchFn,
      routerConfig,
    });
  }

  // 2. If Arkose FunCaptcha frame is present (Outlook / Hotmail / Microsoft enforcementFrame)
  const arkoseTargetFrame = frames.arkoseGameFrame || frames.arkoseEnforcementFrame;
  if (arkoseTargetFrame) {
    onLog?.("info", `Detected Arkose FunCaptcha frame (${arkoseTargetFrame.id})`);
    for (let round = 1; round <= maxRounds; round += 1) {
      const curTree = await cdpSend("Page.getFrameTree").catch(() => null);
      const curFrames = findUniversalCaptchaFramesInTree(curTree?.frameTree);
      const gFrame = curFrames.arkoseGameFrame || curFrames.arkoseEnforcementFrame;
      if (!gFrame) {
        return { ok: true, solved: true, rounds: round - 1, reason: "arkose_frame_cleared" };
      }

      const state = await evalInFrameViaIsolatedWorld(
        cdpSend,
        gFrame.id,
        `(() => {
          const bodyText = String(document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
          const startBtn = document.querySelector('button[data-theme="home.verifyButton"], #home_children_button, button[aria-label*="Verify" i], button[aria-label*="Start" i]');
          if (startBtn && startBtn.offsetWidth > 0) {
            startBtn.click();
            return { stage: 'clicked_start', bodyText };
          }
          const tiles = Array.from(document.querySelectorAll('.tile-button, button[aria-label*="Image" i], .challenge-container button.tile'));
          const rightArrow = document.querySelector('.right-arrow, a.right-arrow, button[aria-label*="Right" i], button[data-theme*="rightArrow"]');
          const submitBtn = document.querySelector('button[data-theme*="submitButton"], button[type="submit"], a.submit-button');
          if (tiles.length >= 6) {
            return { stage: 'arkose_tile', tileCount: tiles.length, promptText: bodyText.slice(0, 180) };
          }
          if (rightArrow && rightArrow.offsetWidth > 0) {
            return { stage: 'arkose_arrows', promptText: bodyText.slice(0, 180), hasSubmit: Boolean(submitBtn) };
          }
          return { stage: 'waiting', bodyText: bodyText.slice(0, 180) };
        })()`,
      );

      if (state?.stage === "clicked_start") {
        onLog?.("info", "Clicked Arkose FunCaptcha Start/Verify button");
        await sleep(2200);
        continue;
      }

      if (state?.stage === "arkose_tile" || state?.stage === "arkose_arrows") {
        const shot = await cdpSend("Page.captureScreenshot", { format: "png" }).catch(() => null);
        if (!shot?.data) {
          await sleep(1000);
          continue;
        }
        const vRes = await askVisionForArkoseOrTextCaptcha(
          shot.data,
          state.stage,
          state.promptText,
          { fetchFn, routerConfig },
        );
        if (state.stage === "arkose_tile" && vRes.ok && vRes.tile) {
          onLog?.("info", `Arkose round ${round}: clicking tile #${vRes.tile} (${state.promptText})`);
          await evalInFrameViaIsolatedWorld(
            cdpSend,
            gFrame.id,
            `(() => {
              const tiles = Array.from(document.querySelectorAll('.tile-button, button[aria-label*="Image" i], .challenge-container button.tile'));
              const el = tiles[${vRes.tile - 1}];
              if (el) { el.click(); return true; }
              return false;
            })()`,
          );
          await sleep(2000);
          continue;
        }
        if (state.stage === "arkose_arrows" && vRes.ok) {
          onLog?.(
            "info",
            `Arkose round ${round}: clicksRight=${vRes.clicksRight} ready=${vRes.readyToSubmit}`,
          );
          await evalInFrameViaIsolatedWorld(
            cdpSend,
            gFrame.id,
            `(async () => {
              const sleep = ms => new Promise(r => setTimeout(r, ms));
              const rightArrow = document.querySelector('.right-arrow, a.right-arrow, button[aria-label*="Right" i], button[data-theme*="rightArrow"]');
              for (let i = 0; i < ${vRes.clicksRight || 0}; i++) {
                if (rightArrow) rightArrow.click();
                await sleep(300);
              }
              const submitBtn = document.querySelector('button[data-theme*="submitButton"], button[type="submit"], a.submit-button');
              if (submitBtn) submitBtn.click();
              return true;
            })()`,
          );
          await sleep(2200);
          continue;
        }
      }
      await sleep(1500);
    }
    return { ok: false, solved: false, rounds: maxRounds, reason: "arkose_max_rounds_exceeded" };
  }

  // 3. Check for Facebook checkpoint / Microsoft HIP image text captcha on main page
  const textCaptchaInfo = await evalInMainPage(
    cdpSend,
    `(() => {
      const input = document.querySelector('input[name="captcha_response"], #captcha_response, input[id*="wlspispSolutionElement"], input[aria-label*="characters" i], input[placeholder*="characters" i]');
      if (!input || input.offsetWidth === 0) return null;
      const img = document.querySelector('img[src*="captcha" i], img[id*="wlspispHipChallenge" i], img[alt*="captcha" i]') ||
        Array.from(document.querySelectorAll('img')).find(el => {
          const r = el.getBoundingClientRect();
          return r.width >= 100 && r.width <= 450 && r.height >= 35 && r.height <= 180;
        });
      const r = img ? img.getBoundingClientRect() : null;
      return {
        hasInput: true,
        imgRect: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null
      };
    })()`,
  );

  if (textCaptchaInfo?.hasInput) {
    const clip = textCaptchaInfo.imgRect;
    const shot = await cdpSend("Page.captureScreenshot", {
      format: "png",
      ...(clip && clip.width > 20
        ? {
            clip: {
              x: Math.max(0, clip.x),
              y: Math.max(0, clip.y),
              width: clip.width,
              height: clip.height,
              scale: 1,
            },
          }
        : {}),
    }).catch(() => null);
    if (shot?.data) {
      const vRes = await askVisionForArkoseOrTextCaptcha(shot.data, "text_captcha", "", {
        fetchFn,
        routerConfig,
      });
      if (vRes.ok && vRes.text) {
        onLog?.("info", `Text CAPTCHA decoded via Vision: "${vRes.text}"`);
        await evalInMainPage(
          cdpSend,
          `(() => {
            const input = document.querySelector('input[name="captcha_response"], #captcha_response, input[id*="wlspispSolutionElement"], input[aria-label*="characters" i], input[placeholder*="characters" i]');
            if (!input) return false;
            input.focus();
            input.value = ${JSON.stringify(vRes.text)};
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            const btn = document.querySelector('button[type="submit"], input[type="submit"], #idSIButton9');
            if (btn) btn.click();
            return true;
          })()`,
        );
        await sleep(2500);
        return { ok: true, solved: true, rounds: 1, reason: "text_captcha_submitted", text: vRes.text };
      }
    }
    return { ok: false, solved: false, rounds: 1, reason: "text_captcha_vision_failed" };
  }

  return { ok: true, solved: true, skipped: true, rounds: 0, reason: "no_captcha_present" };
}

/**
 * Playwright Page wrapper for `solveArkoseOrFacebookCaptchaViaCdp` (`ok 3`).
 */
async function solveUniversalCaptchaOnPlaywrightPage(page, options = {}) {
  if (!page || typeof page.context !== "function") {
    return { ok: false, solved: false, reason: "invalid_playwright_page" };
  }
  let cdpSession = null;
  try {
    cdpSession = await page.context().newCDPSession(page);
    const cdpSend = (method, params = {}) => cdpSession.send(method, params);
    return await solveArkoseOrFacebookCaptchaViaCdp(cdpSend, options);
  } catch (err) {
    return {
      ok: false,
      solved: false,
      reason: `playwright_cdp_error:${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    if (cdpSession) {
      await cdpSession.detach().catch(() => undefined);
    }
  }
}

/**
 * Handles Google `/uplevelingstep/selection` + `/v3/signin/challenge/iap` SMS OTP anti-bot gate
 * and submits `/restrictions/<id>/appeal` via raw CDP (`cdpSend`) (`ok 3`).
 */
async function handleGoogleUplevelingSmsAppealViaCdp(
  cdpSend,
  {
    code = "0001",
    account = "",
    contactEmail = "a1infi@outlook.com",
    onLog = null,
  } = {},
) {
  let simHelpers = null;
  try {
    simHelpers = await import("../../../P0002-Social-Hub/server/stealth-cdp-client.mjs");
  } catch (err) {
    return { ok: false, solved: false, reason: `sim_helper_import_failed:${err?.message || err}` };
  }

  // Step 1: If on /restrictions/<id> overview, click Submit appeal / Start appeal
  const startPt = await evalInMainPage(
    cdpSend,
    `(() => {
      for (const el of document.querySelectorAll("a[href*='/appeal'], button, [role='button'], [role='link']")) {
        const txt = (el.innerText || "").replace(/\\s+/g, " ").trim();
        const href = el.getAttribute("href") || "";
        if (href.includes("/appeal") || /^(Submit appeal|Start appeal|Gửi kháng nghị|Gửi đơn kháng nghị|Bắt đầu kháng nghị|Appeal|Kháng nghị)$/i.test(txt)) {
          const r = el.getBoundingClientRect();
          if (r.width > 10 && r.height > 10) {
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), text: txt };
          }
        }
      }
      return null;
    })()`,
  );
  if (startPt?.x > 0) {
    onLog?.("info", `[AppealSMS #${code}] Clicking '${startPt.text}' on restriction overview`);
    await cdpClickPoint(cdpSend, startPt.x, startPt.y);
    for (let i = 0; i < 20; i += 1) {
      await sleep(1000);
      const u = await evalInMainPage(cdpSend, "location.href");
      if (String(u || "").includes("/uplevelingstep/") || String(u || "").includes("/challenge/iap") || String(u || "").includes("/appeal")) {
        break;
      }
    }
    await sleep(2200);
  }

  // Step 2: If on /uplevelingstep/selection or /challenge/iap, verify phone via GrizzlySMS
  const curUrl = String((await evalInMainPage(cdpSend, "location.href")) || "");
  let phoneUsed = null;
  if (/\/uplevelingstep\/selection|\/challenge\/iap/i.test(curUrl)) {
    const triedCountries = [];
    let otpVerified = false;
    for (let attempt = 1; attempt <= 4 && !otpVerified; attempt += 1) {
      const stepUrl = String((await evalInMainPage(cdpSend, "location.href")) || "");
      if (stepUrl.includes("/uplevelingstep/selection")) {
        const smsPt = await evalInMainPage(
          cdpSend,
          `(() => {
            for (const li of document.querySelectorAll("li, div[role='link']")) {
              const txt = (li.innerText || "").replace(/\\s+/g, " ").trim();
              if (/Xác minh số điện thoại|Verify your phone number|SMS/i.test(txt) && !/Quét mã QR|Scan a QR/i.test(txt)) {
                const target = li.querySelector("div[role='link']") || li;
                const r = target.getBoundingClientRect();
                if (r.width > 10 && r.height > 10) {
                  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), text: txt };
                }
              }
            }
            return null;
          })()`,
        );
        if (smsPt?.x > 0) {
          onLog?.("info", `[AppealSMS #${code}] Clicking SMS verification option on /uplevelingstep/selection`);
          await cdpClickPoint(cdpSend, smsPt.x, smsPt.y);
          for (let i = 0; i < 15; i += 1) {
            await sleep(1000);
            const uAfter = String((await evalInMainPage(cdpSend, "location.href")) || "");
            if (uAfter.includes("/challenge/iap")) break;
          }
          await sleep(2200);
        }
      }

      const simAlloc = await simHelpers
        .rentOrReuseLongTermSim({
          provider: "grizzlysms",
          service: "google",
          account,
          useMultiplexPool: false,
          allowOneShotForGoogle: true,
          excludeCountries: triedCountries,
        })
        .catch(() => ({ ok: false }));
      if (!simAlloc?.ok || !simAlloc.phoneNumber) break;
      if (simAlloc.grizzlyCountryId) triedCountries.push(String(simAlloc.grizzlyCountryId));

      onLog?.(
        "info",
        `[AppealSMS #${code}] Rented GrizzlySMS ${simAlloc.phoneNumber} (req=${simAlloc.requestId}, cost=$${simAlloc.cost ?? "?"})`,
      );
      await evalInMainPage(
        cdpSend,
        `((phoneVal) => {
          const inp = document.querySelector("input#deviceAddress, input#phoneNumberId, input[type='tel']");
          if (!inp) return false;
          inp.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
          if (setter) setter.call(inp, phoneVal);
          else inp.value = phoneVal;
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.dispatchEvent(new Event("change", { bubbles: true }));
          const btn =
            document.querySelector("#idvanyphonecollectNext button, button[jsname='LgbsSe'], button[type='submit']") ||
            Array.from(document.querySelectorAll("button, div[role='button']")).find((b) =>
              /^(Next|Tiếp theo|Send|Gửi|Verify|Xác minh)$/i.test((b.innerText || "").trim())
            );
          if (btn) btn.click();
          return true;
        })(${JSON.stringify(simAlloc.phoneNumber)})`,
      );

      let postPhone = null;
      for (let w = 0; w < 10; w += 1) {
        await sleep(1000);
        postPhone = await evalInMainPage(
          cdpSend,
          `(() => {
            const url = location.href;
            const body = (document.body?.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 600);
            const pinInp = document.querySelector("input#idvAnyPhonePin, input#smsUserPin, input#idvPin, input[name='idvPin'], input[name='pin']");
            const isVerifyUrl = url.includes("/challenge/iap/verify") || /vừa được gửi tới|was just sent to|Enter the code|Nhập mã/i.test(body);
            const isError = /quá nhiều lần|too many times|cannot be used|không thể dùng/i.test(body);
            return {
              url,
              hasPin: Boolean((pinInp && pinInp.offsetWidth > 0) || (isVerifyUrl && !isError)),
              isError,
            };
          })()`,
        );
        if (postPhone?.hasPin || postPhone?.isError) break;
      }

      if (!postPhone?.hasPin || postPhone?.isError) {
        if (simAlloc.requestId) {
          await simHelpers.cancelGrizzlySmsActivation({ requestId: simAlloc.requestId }).catch(() => undefined);
        }
        continue;
      }

      await sleep(2200);
      const smsOtp = await simHelpers
        .pollLongTermSimOtp({
          provider: "grizzlysms",
          requestId: simAlloc.requestId,
          service: "google",
          maxAttempts: 15,
          intervalMs: 4000,
        })
        .catch(() => ({ ok: false }));

      if (smsOtp?.ok && smsOtp.otpCode) {
        onLog?.("info", `[AppealSMS #${code}] Received OTP ${smsOtp.otpCode} for ${simAlloc.phoneNumber}`);
        phoneUsed = simAlloc.phoneNumber;
        await evalInMainPage(
          cdpSend,
          `((otpVal) => {
            const pinInp =
              document.querySelector("input#idvAnyPhonePin, input#smsUserPin, input#idvPin, input[name='idvPin'], input[name='pin'], input[type='tel']") ||
              Array.from(document.querySelectorAll("input")).find((e) => e.offsetWidth > 0 && e.type !== "hidden");
            if (!pinInp) return false;
            pinInp.focus();
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
            if (setter) setter.call(pinInp, otpVal);
            else pinInp.value = otpVal;
            pinInp.dispatchEvent(new Event("input", { bubbles: true }));
            pinInp.dispatchEvent(new Event("change", { bubbles: true }));
            const btn =
              document.querySelector("#idvanyphoneverifyNext button, button[jsname='LgbsSe'], button[type='submit']") ||
              Array.from(document.querySelectorAll("button, div[role='button']")).find((b) =>
                /^(Next|Tiếp theo|Verify|Xác minh)$/i.test((b.innerText || "").trim())
              );
            if (btn) btn.click();
            return true;
          })(${JSON.stringify(String(smsOtp.otpCode).trim())})`,
        );
        otpVerified = true;
        for (let rIdx = 0; rIdx < 30; rIdx += 1) {
          await sleep(1000);
          const uNow = String((await evalInMainPage(cdpSend, "location.href")) || "");
          if (/^https?:\/\/myaccount\.google\.com\//i.test(uNow)) break;
        }
        await sleep(3200);
      } else if (simAlloc.requestId) {
        await simHelpers.cancelGrizzlySmsActivation({ requestId: simAlloc.requestId }).catch(() => undefined);
      }
    }
  }

  // Step 3: Fill and submit the /restrictions/<id>/appeal form
  let submitted = false;
  for (let step = 1; step <= 5; step += 1) {
    const st = await evalInMainPage(
      cdpSend,
      `((contactEmailVal) => {
        const url = location.href;
        const body = (document.body?.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 900);
        if (/Đã nộp đơn khiếu nại|Appeal submitted|received your appeal|review your request/i.test(body)) {
          return { url, body, appealSubmitted: true };
        }
        const setVal = (el, val) => {
          el.focus();
          const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
          if (setter) setter.call(el, val);
          else el.value = val;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        };
        for (const ta of document.querySelectorAll("textarea")) {
          if (ta.offsetWidth > 0) {
            const isGcp47 = /\/restrictions\/47\b/i.test(url);
            setVal(
              ta,
              isGcp47
                ? "This is my personal Google Cloud Platform account used for software development and API testing. I have not violated any Google Cloud terms of service. Please review and restore my Google Cloud Platform access."
                : "This is my personal Gmail account used for everyday communication, subscriptions, and cloud services. I have not sent spam or violated Google policies. Please review and restore my Gmail access."
            );
          }
        }
        for (const inp of document.querySelectorAll("input[type='email'], input[type='text']")) {
          if (inp.offsetWidth === 0) continue;
          const al = inp.getAttribute("aria-label") || "";
          if (/Tìm trong|Search/i.test(al)) continue;
          setVal(inp, contactEmailVal);
        }
        for (const btn of document.querySelectorAll("button, div[role='button'], a[role='button'], input[type='submit']")) {
          if (btn.offsetWidth === 0) continue;
          const label = (btn.innerText || btn.value || "").replace(/\\s+/g, " ").trim();
          if (
            /^(Gửi đơn kháng nghị|Gửi kháng nghị|Nộp đơn khiếu nại|Bắt đầu kháng nghị|Submit appeal|Start appeal|Next|Tiếp theo|Continue|Tiếp tục|Submit|Gửi|Agree|Đồng ý)$/i.test(
              label
            )
          ) {
            btn.click();
            return { url, body, clickedBtn: label };
          }
        }
        return { url, body, clickedBtn: null };
      })(${JSON.stringify(contactEmail || "a1infi@outlook.com")})`,
    );
    if (st?.appealSubmitted) {
      submitted = true;
      break;
    }
    if (!st?.clickedBtn) break;
    await sleep(4200);
  }

  const finalCheck = await evalInMainPage(
    cdpSend,
    `(() => ({
      url: location.href,
      body: (document.body?.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 600),
    }))()`,
  );
  const restrictionIdMatch = `${finalCheck?.url || ""} ${curUrl}`.match(/\/restrictions\/(\d+)/i);
  const restrictionId = restrictionIdMatch ? restrictionIdMatch[1] : null;
  if (
    submitted ||
    /Đã nộp đơn khiếu nại|Appeal submitted|received your appeal|review your request|[?&]ai=\d+/i.test(
      `${finalCheck?.url || ""} ${finalCheck?.body || ""}`,
    )
  ) {
    return {
      ok: true,
      solved: true,
      appealSubmitted: true,
      restrictionId,
      phoneUsed,
      url: finalCheck?.url || "",
      detail: finalCheck?.body || "",
    };
  }
  return {
    ok: false,
    solved: false,
    restrictionId,
    phoneUsed,
    url: finalCheck?.url || "",
    detail: finalCheck?.body || "",
  };
}

module.exports = {
  loadRouterConfig,
  extractVisionResponseText,
  parseVisionTileNumbers,
  askVisionForRecaptchaTiles,
  findRecaptchaFramesInTree,
  findUniversalCaptchaFramesInTree,
  askVisionForArkoseOrTextCaptcha,
  evalInFrameViaIsolatedWorld,
  solveGoogleRecaptchaViaCdp,
  solveGoogleRecaptchaOnPlaywrightPage,
  solveArkoseOrFacebookCaptchaViaCdp,
  solveUniversalCaptchaOnPlaywrightPage,
  matchMaskedRecoveryEmail,
  handleGoogleRecoveryEmailChallengeViaCdp,
  handleGoogleQrChallengeViaCdp,
  handleGoogleUplevelingSmsAppealViaCdp,
};
