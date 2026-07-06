import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import http from "http";
import crypto from "node:crypto";

const DEBUG_PORT = parseInt(process.env.P0003_DEBUG_PORT || "53214", 10);
const ACCOUNT_EMAIL = process.env.P0006_OAUTH_EMAIL || "maxxmedia001@gmail.com";
const SECRETS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "P0006-Content-Studio", "worker", "secrets");
const REDIRECT_PORT = 19027;
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

const creds = JSON.parse(readFileSync(resolve(SECRETS_DIR, "google-credentials.json"), "utf8")).installed;
const clientId = creds.client_id;
const clientSecret = creds.client_secret;

function b64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const verifier = b64url(crypto.randomBytes(32));
const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
const state = b64url(crypto.randomBytes(16));

const authUrl = new URL("https://accounts.google.com/o/oauth2/auth");
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", `http://localhost:${REDIRECT_PORT}/`);
authUrl.searchParams.set("scope", SCOPES.join(" "));
authUrl.searchParams.set("state", state);
authUrl.searchParams.set("code_challenge", challenge);
authUrl.searchParams.set("code_challenge_method", "S256");
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");
authUrl.searchParams.set("login_hint", ACCOUNT_EMAIL);

const codePromise = new Promise((resolveCode, reject) => {
  const server = http.createServer((req, res) => {
    try {
      const u = new URL(req.url || "/", `http://localhost:${REDIRECT_PORT}`);
      const authCode = u.searchParams.get("code");
      const err = u.searchParams.get("error");
      if (err) throw new Error(err);
      if (!authCode) {
        res.writeHead(400);
        res.end("Missing code");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h1>OAuth OK</h1>");
      server.close();
      resolveCode(authCode);
    } catch (e) {
      server.close();
      reject(e);
    }
  });
  server.listen(REDIRECT_PORT, "127.0.0.1", () => console.log("callback", REDIRECT_PORT));
  setTimeout(() => {
    server.close();
    reject(new Error("OAuth callback timeout"));
  }, 180000);
});

async function clickOAuth(page) {
  for (const frame of page.frames()) {
    await frame
      .evaluate((email) => {
        const click = (el) => el?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        const approve = document.querySelector("#submit_approve_access");
        if (approve) {
          click(approve);
          return "approve";
        }
        const btn = [...document.querySelectorAll("button")].find((b) =>
          /allow|continue|tiếp tục|cho phép|đồng ý|truy cập/i.test(b.textContent || ""),
        );
        if (btn) {
          click(btn);
          return "button";
        }
        const acct = [...document.querySelectorAll("div,li")].find(
          (e) => e.textContent?.includes(email) && e.children.length <= 6,
        );
        if (acct) {
          click(acct);
          return "account";
        }
        return "";
      }, ACCOUNT_EMAIL)
      .catch(() => "");
  }
}

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
const context = browser.contexts()[0];
let page = context.pages().find((p) => p.url().includes("accounts.google")) || context.pages()[0];
if (!page) page = await context.newPage();
await page.goto(authUrl.toString(), { waitUntil: "domcontentloaded", timeout: 120000 });

for (let i = 0; i < 60; i++) {
  if (page.url().includes(`localhost:${REDIRECT_PORT}`)) break;
  await clickOAuth(page);
  await page.waitForTimeout(2000);
}

const authCode = await codePromise;
const body = new URLSearchParams({
  code: authCode,
  client_id: clientId,
  client_secret: clientSecret,
  redirect_uri: `http://localhost:${REDIRECT_PORT}/`,
  grant_type: "authorization_code",
  code_verifier: verifier,
});

const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body,
});
const tokenJson = await tokenRes.json();
if (!tokenRes.ok) throw new Error(tokenJson.error_description || tokenJson.error || "token failed");

writeFileSync(
  resolve(SECRETS_DIR, "google-token.json"),
  JSON.stringify(
    {
      token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      token_uri: "https://oauth2.googleapis.com/token",
      client_id: clientId,
      client_secret: clientSecret,
      scopes: SCOPES,
      expiry: new Date(Date.now() + (tokenJson.expires_in || 3600) * 1000).toISOString(),
    },
    null,
    2,
  ),
);

writeFileSync(
  resolve(SECRETS_DIR, "drive-config.json"),
  JSON.stringify(
    {
      project_id: creds.project_id,
      client_id: clientId,
      drive_folder_name: "P0006-Content-Studio",
      account_email: ACCOUNT_EMAIL,
      stealth_profile: "0098",
    },
    null,
    2,
  ),
);

console.log("SAVED google-token.json for", ACCOUNT_EMAIL);
await browser.close();
