/**
 * Shared Google OAuth v3 Auto-SSO & 2FA TOTP Popup State Machine (`P0003` / `P0020` / `P0006`).
 *
 * Reusable across AI web services (`ElevenLabs`, `HeyGen`, `Suno`, `Sync.so`, `Kling`, `Higgsfield`,
 * `ChatGPT`, `Claude`, `CapCut`, `Canva`) running on P0003 Stealth Browser headless profiles.
 *
 * Capabilities:
 *   1. `precheckStealthProfileProxy(profileName)`: < 1.5s TCP socket check before launching Chromium.
 *   2. `generateTotpCode(secretB32)`: RFC 6238 6-digit TOTP generator for Google Authenticator 2FA.
 *   3. `runStealthGoogleOAuthV3Popup(page, options)`: Full Google OAuth v3 popup state machine:
 *      - Handles `about:blank` initial popup delay
 *      - Selects matching or signed-in account on `/v3/signin/accountchooser` & `/oauthchooseaccount`
 *      - Fills `#identifierId` (email) and `input[name="Passwd"]` (password)
 *      - Bypasses `/challenge/dp` device prompt via `"Try another way"` (`Thử cách khác` / multilingual)
 *      - Selects `[data-challengetype="6"]` (Authenticator TOTP) and fills `#totpPin`
 *      - Fills recovery email (`#knowledge-preregistered-email-response`) when prompted
 *      - Clicks the final `Continue` / `Allow` button (`allLgbs[allLgbs.length - 1]`) on `/signin/oauth/id`
 */

import crypto from "node:crypto";
import net from "node:net";

const STEALTH_API = process.env.STEALTH_API_URL || "http://127.0.0.1:6003";

export const PROTECTED_STEALTH_PROFILES = new Set([
  "0010",
  "0011",
  "0012",
  "0013",
  "0014",
  "0015",
  "0016",
  "0017",
  "0018",
  "0019",
  "0020",
  "0021",
  "0059",
  "0069",
]);

/**
 * Generates a 6-digit RFC 6238 TOTP code from a Base32 secret string.
 */
export function generateTotpCode(secretB32 = "") {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = String(secretB32 || "")
    .replace(/[^A-Za-z2-7]/g, "")
    .toUpperCase();
  if (!cleaned) return "";
  let bits = "";
  for (const ch of cleaned) {
    const idx = alphabet.indexOf(ch);
    if (idx >= 0) bits += idx.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  const key = Buffer.from(bytes);
  const counter = Math.floor(Date.now() / 30000);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return String(code).padStart(6, "0");
}

let cachedProfilesByName = null;

export async function getStealthProfileByName(profileName, { forceRefresh = false } = {}) {
  if (!cachedProfilesByName || forceRefresh) {
    const profRes = await fetch(`${STEALTH_API}/api/profiles`, {
      headers: { "X-Stealth-Agent-Smoke": "1" },
      signal: AbortSignal.timeout(5000),
    })
      .then((r) => r.json())
      .catch(() => null);
    const list = Array.isArray(profRes) ? profRes : profRes?.profiles || [];
    cachedProfilesByName = new Map(list.map((p) => [String(p?.name || "").trim(), p]));
  }
  return cachedProfilesByName.get(String(profileName || "").trim()) || null;
}

/**
 * Fast TCP/Proxy Pre-Flight Check (< 1.5s) before launching Chromium on a Stealth profile.
 */
export async function precheckStealthProfileProxy(profileName, timeoutMs = 1500) {
  const prof = await getStealthProfileByName(profileName);
  if (!prof) return { ok: true, mode: "new_profile" };
  const rawProxy =
    prof?.proxy?.server ||
    prof?.proxyServer ||
    prof?.proxy_url ||
    (typeof prof?.proxy === "string" ? prof.proxy : "");
  const trimmed = String(rawProxy || "").trim();
  if (!trimmed || trimmed === "direct" || trimmed === "none") {
    return { ok: true, mode: "direct" };
  }
  let host = "";
  let port = 0;
  try {
    const normalized = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    const u = new URL(normalized);
    host = u.hostname;
    port = Number(u.port);
  } catch {
    const parts = trimmed.split(":");
    if (parts.length >= 2) {
      host = parts[0];
      port = Number(parts[1]);
    }
  }
  if (!host || !Number.isFinite(port) || port <= 0) {
    return { ok: true, mode: "direct" };
  }
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok, reason) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok ? { ok: true, mode: "proxy", host, port } : { ok: false, reason, host, port });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true, "connected"));
    socket.once("timeout", () => finish(false, `proxy_timeout (${host}:${port})`));
    socket.once("error", (err) => finish(false, `proxy_error (${host}:${port} ${err?.code || "ERR"})`));
    socket.connect(port, host);
  });
}

/**
 * Executes the Google OAuth v3 popup state machine on `page`.
 *
 * @param {import('playwright-core').Page} page - Main service page that opens the Google OAuth popup
 * @param {object} opts
 * @param {string} opts.email - Target Google account email
 * @param {string} [opts.password] - Account password
 * @param {string} [opts.secret] - Base32 TOTP secret for 2FA
 * @param {string} [opts.backupCode] - Recovery email or backup code
 * @param {string} [opts.profile] - 4-digit Stealth profile code
 * @param {Function} [opts.triggerPopup] - Async callback that clicks the "Continue with Google" button
 * @param {Function} [opts.onCaptcha] - Optional captcha solver callback `(gPage, { code, service }) => Promise<void>`
 * @param {number} [opts.maxSteps=9] - Max state-machine steps
 */
export async function runStealthGoogleOAuthV3Popup(
  page,
  {
    email = "",
    password = "",
    secret = "",
    backupCode = "",
    profile = "",
    triggerPopup,
    onCaptcha = null,
    maxSteps = 9,
  } = {},
) {
  const actions = [];
  const [popup] = await Promise.all([
    page
      .context()
      .waitForEvent("page", { timeout: 10000 })
      .catch(() => null),
    typeof triggerPopup === "function" ? triggerPopup() : Promise.resolve(),
  ]);
  await new Promise((r) => setTimeout(r, 2500));

  for (let step = 0; step < maxSteps; step++) {
    const allPages = page
      .context()
      .pages()
      .filter((p) => !p.isClosed());
    const gPage =
      (popup && !popup.isClosed() ? popup : null) ||
      [...allPages]
        .reverse()
        .find((p) => /accounts\.google\.com|firebaseapp\.com/i.test(p.url()) && !/sessionexpired/i.test(p.url()));
    if (!gPage) break;
    if (gPage.url() === "about:blank") {
      await new Promise((r) => setTimeout(r, 2500));
      continue;
    }

    if (gPage.url().includes("/challenge/recaptcha") && typeof onCaptcha === "function") {
      await onCaptcha(gPage, { code: String(profile), service: "Gmail" }).catch(() => null);
    }

    const gCode = secret ? generateTotpCode(secret) : "";
    const action = await gPage
      .evaluate(
        ({ gEmail, gPass, gCode: totpCode, gRec }) => {
          const setVal = (inp, val) => {
            inp.focus();
            const prev = inp.value;
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
            if (setter) setter.call(inp, val);
            else inp.value = val;
            if (inp._valueTracker) inp._valueTracker.setValue(prev);
            inp.dispatchEvent(new Event("input", { bubbles: true }));
            inp.dispatchEvent(new Event("change", { bubbles: true }));
          };
          const clickNext = (sel) => {
            const btn = document.querySelector(sel) || document.querySelector('button[jsname="LgbsSe"]');
            if (btn) btn.click();
          };
          const emailInp = document.querySelector('input[type="email"], input#identifierId');
          if (emailInp && emailInp.offsetWidth > 0 && gEmail && !emailInp.dataset.filledOnce) {
            emailInp.dataset.filledOnce = "1";
            setVal(emailInp, gEmail);
            clickNext("#identifierNext button, #identifierNext");
            return "filled_google_email";
          }
          const passInp = document.querySelector('input[type="password"], input[name="Passwd"]');
          if (passInp && passInp.offsetWidth > 0 && gPass && !passInp.dataset.filledOnce) {
            passInp.dataset.filledOnce = "1";
            setVal(passInp, gPass);
            clickNext("#passwordNext button, #passwordNext");
            return "filled_google_password";
          }
          const totpInp = document.querySelector('input[type="tel"], input#totpPin, input[name="totpPin"]');
          if (totpInp && totpInp.offsetWidth > 0 && totpCode && !totpInp.dataset.filledOnce) {
            totpInp.dataset.filledOnce = "1";
            setVal(totpInp, totpCode);
            clickNext("#totpNext button, #totpNext");
            return "filled_google_totp";
          }
          const recInp = document.querySelector(
            'input#knowledge-preregistered-email-response, input[name="knowledgePreregisteredEmailResponse"]',
          );
          if (recInp && recInp.offsetWidth > 0 && gRec && !recInp.dataset.filledOnce) {
            recInp.dataset.filledOnce = "1";
            setVal(recInp, gRec);
            clickNext('button[jsname="LgbsSe"], #next');
            return "filled_google_recovery";
          }
          const authChallenge = document.querySelector('[data-challengetype="6"]');
          if (authChallenge && authChallenge.offsetWidth > 0) {
            authChallenge.click();
            return "clicked_google_totp_option";
          }
          if (
            location.href.includes("/challenge/") &&
            !location.href.includes("/challenge/selection") &&
            !location.href.includes("/challenge/totp") &&
            !totpInp
          ) {
            const tryBtns = Array.from(document.querySelectorAll('button, div[role="button"], span[jsname]'));
            const tryAnother =
              tryBtns.find((b) =>
                /^(Try another way|Th\u1eed c\u00e1ch kh\u00e1c|Otra forma|Tentar de outra forma|Другой способ|Cara lain)$/i.test(
                  (b.innerText || "").replace(/\s+/g, " ").trim(),
                ),
              ) ||
              (location.href.includes("/challenge/dp")
                ? document.querySelector(
                    'div[jsname="Njthtb"] button, button[jsname="Pr7Yme"], button[jsname="LgbsSe"]',
                  )
                : null);
            if (tryAnother && !tryAnother.dataset.clickedOnce) {
              tryAnother.dataset.clickedOnce = "1";
              (tryAnother.closest('button, div[role="button"]') || tryAnother).click();
              return "clicked_google_try_another";
            }
          }
          const items = Array.from(
            document.querySelectorAll("li [data-identifier], [data-identifier], [data-email]"),
          );
          if (items.length > 0 && /oauthchooseaccount|accountchooser/i.test(location.href)) {
            const exact = items.find((el) =>
              String(el.getAttribute("data-identifier") || el.getAttribute("data-email") || "")
                .toLowerCase()
                .includes(gEmail.toLowerCase()),
            );
            if (exact) {
              exact.click();
              const target = exact.closest('div[role="link"], li');
              if (target && target !== exact) target.click();
              return "clicked_account:" + (exact.getAttribute("data-identifier") || exact.getAttribute("data-email"));
            }
            const signedIn = items.find((el) => {
              const row = el.closest('li, div[role="link"]') || el;
              return !/signed out|\u0111\u00e3 \u0111\u0103ng xu\u1ea5t/i.test(row.innerText || "");
            });
            if (signedIn) {
              signedIn.click();
              const target = signedIn.closest('div[role="link"], li');
              if (target && target !== signedIn) target.click();
              return (
                "clicked_signed_in_account:" +
                (signedIn.getAttribute("data-identifier") || signedIn.getAttribute("data-email"))
              );
            }
            const useAnother = Array.from(document.querySelectorAll('li, div[role="link"]')).find(
              (el) =>
                !el.querySelector("[data-identifier]") &&
                /use another account|s\u1eed d\u1ee5ng m\u1ed9t t\u00e0i kho\u1ea3n kh\u00e1c/i.test(
                  (el.innerText || "").trim(),
                ),
            );
            if (useAnother) {
              useAnother.click();
              return "clicked_use_another_account";
            }
          }
          const btns = Array.from(document.querySelectorAll('button, div[role="button"], span[jsname]'));
          const cont = btns.find((b) =>
            /^(continue|allow|i agree|confirm|ti\u1ebfp t\u1ee5c|cho ph\u00e9p|\u0111\u1ed3ng \u00fd|продолжить|lanjutkan|continuar|weiter)/i.test(
              (b.innerText || "").replace(/\s+/g, " ").trim(),
            ),
          );
          if (cont) {
            (cont.closest('button, div[role="button"]') || cont).click();
            return "clicked_btn:" + (cont.innerText || "").trim();
          }
          if (location.pathname.includes("/signin/oauth/")) {
            const allLgbs = Array.from(
              document.querySelectorAll(
                '#submit_approve_access button, div[id="confirm_yes"] button, button[jsname="LgbsSe"]',
              ),
            ).filter((b) => b.offsetWidth > 0);
            const confirmBtn = allLgbs.length >= 2 ? allLgbs[allLgbs.length - 1] : allLgbs[0];
            if (confirmBtn) {
              confirmBtn.click();
              return "clicked_oauth_confirm_last:" + (confirmBtn.innerText || "").trim();
            }
          }
          return "waiting_on:" + location.pathname;
        },
        { gEmail: email, gPass: password || "", gCode, gRec: backupCode || "" },
      )
      .catch(() => null);

    if (action) actions.push(action);
    await new Promise((r) => setTimeout(r, 3600));
    if (action && action.startsWith("waiting_on:/v3/signin/rejected")) {
      return { ok: false, rejected: true, actions };
    }
  }

  return { ok: true, rejected: false, actions };
}
