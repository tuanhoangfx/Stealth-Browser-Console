#!/usr/bin/env node
/**
 * One-time OAuth refresh token helper for Chrome Web Store API.
 *
 * 1. Create Desktop OAuth client in Google Cloud Console
 * 2. Save client JSON to scripts/cws-oauth-client.json (gitignored)
 * 3. Run: node scripts/cws-oauth-token.mjs
 * 4. Open printed URL → sign in as tuanhoangfx@gmail.com → paste redirect URL
 *
 * Scope: https://www.googleapis.com/auth/chromewebstore
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_PATH = path.join(__dirname, "cws-oauth-client.json");
const PORT = 8765;
const REDIRECT = `http://127.0.0.1:${PORT}/oauth/callback`;
const SCOPE = "https://www.googleapis.com/auth/chromewebstore";

function loadClient() {
  if (!fs.existsSync(CLIENT_PATH)) {
    throw new Error(`Missing ${CLIENT_PATH}\nDownload OAuth Desktop client JSON from Google Cloud Console.`);
  }
  const raw = JSON.parse(fs.readFileSync(CLIENT_PATH, "utf8"));
  const block = raw.installed ?? raw.web ?? raw;
  return {
    clientId: block.client_id,
    clientSecret: block.client_secret,
  };
}

async function exchangeCode(clientId, clientSecret, code) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Token exchange failed: ${text}`);
  return JSON.parse(text);
}

async function main() {
  const { clientId, clientSecret } = loadClient();
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", REDIRECT);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  console.log("\n1. Open this URL in Chrome (publisher account tuanhoangfx@gmail.com):\n");
  console.log(authUrl.toString());
  console.log("\n2. Waiting for callback on", REDIRECT, "\n");

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url?.startsWith("/oauth/callback")) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
      const authCode = url.searchParams.get("code");
      const err = url.searchParams.get("error");
      if (err) {
        res.writeHead(400);
        res.end(`Error: ${err}`);
        reject(new Error(err));
        server.close();
        return;
      }
      if (!authCode) {
        res.writeHead(400);
        res.end("Missing code");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h1>OK — return to terminal</h1>");
      resolve(authCode);
      server.close();
    });
    server.listen(PORT, "127.0.0.1", () => {});
    server.on("error", reject);
  });

  const tokens = await exchangeCode(clientId, clientSecret, code);
  const sharedEnv = path.resolve(__dirname, "..", "..", "..", ".env.shared");
  upsertSharedEnv(sharedEnv, {
    CWS_CLIENT_ID: clientId,
    CWS_CLIENT_SECRET: clientSecret,
    CWS_REFRESH_TOKEN: tokens.refresh_token,
    CWS_EXTENSION_ID: "kaaadageakdandpobcofplmfbjfjabdk",
  });
  console.log("\n--- Saved to .env.shared + GitHub Actions secrets ---\n");
  console.log("CWS_CLIENT_ID=", clientId);
  console.log("CWS_CLIENT_SECRET=", clientSecret);
  console.log("CWS_REFRESH_TOKEN=", tokens.refresh_token);
  console.log("CWS_EXTENSION_ID= kaaadageakdandpobcofplmfbjfjabdk");
  console.log("\nLocal PowerShell:\n");
  console.log(`$env:CWS_CLIENT_ID="${clientId}"`);
  console.log(`$env:CWS_CLIENT_SECRET="${clientSecret}"`);
  console.log(`$env:CWS_REFRESH_TOKEN="${tokens.refresh_token}"`);
}

function upsertSharedEnv(filePath, entries) {
  const lines = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").split(/\r?\n/) : [];
  const keys = new Set(Object.keys(entries));
  const out = [];
  const seen = new Set();
  for (const line of lines) {
    const m = line.match(/^([A-Z0-9_]+)=/);
    if (m && keys.has(m[1])) {
      out.push(`${m[1]}=${entries[m[1]]}`);
      seen.add(m[1]);
      continue;
    }
    out.push(line);
  }
  const missing = Object.entries(entries).filter(([k]) => !seen.has(k));
  if (missing.length) {
    if (out.length && out[out.length - 1] !== "") out.push("");
    out.push("# --- E0001 Chrome Web Store API (auto-updated) ---");
    for (const [k, v] of missing) out.push(`${k}=${v}`);
  }
  fs.writeFileSync(filePath, `${out.join("\n").replace(/\n+$/, "")}\n`);
  console.log(`Updated ${filePath}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
