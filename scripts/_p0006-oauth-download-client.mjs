import { chromium } from "playwright-core";
import { writeFileSync, readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const DEBUG_PORT = parseInt(process.env.P0003_DEBUG_PORT || "51169", 10);
const PROJECT_ID = "our-foundry-442305-d3";
const CLIENT_ID = process.env.P0006_OAUTH_CLIENT_ID || "1063839152855-cr5thq8m3qfnao6u3o8vsn8bq1c01cfa";
const SECRETS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "P0006-Content-Studio", "worker", "secrets");

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
const page = browser.contexts()[0].pages()[0] || (await browser.contexts()[0].newPage());
const cdp = await page.context().newCDPSession(page);
await cdp.send("Browser.setDownloadBehavior", {
  behavior: "allow",
  downloadPath: SECRETS_DIR.replace(/\\/g, "/"),
  eventsEnabled: true,
});

const url = `https://console.cloud.google.com/auth/clients/${CLIENT_ID}.apps.googleusercontent.com?project=${PROJECT_ID}`;
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(8000);

const downloadPromise = page.waitForEvent("download", { timeout: 30000 }).catch(() => null);

const dlText = page.getByText(/download json/i);
const dlBtn = page.locator("button, a").filter({ hasText: /download json/i });
const iconBtn = page.locator('[mattooltip*="Download"], [aria-label*="Download"], [aria-label*="download"]');

if (await dlText.count()) {
  await dlText.first().click({ force: true });
} else if (await dlBtn.count()) {
  await dlBtn.first().click({ force: true });
} else if (await iconBtn.count()) {
  await iconBtn.first().click({ force: true });
} else {
  const icons = page.locator("mat-icon, cfc-icon").filter({ hasText: /download/i });
  if (await icons.count()) await icons.first().click({ force: true });
}

const download = await downloadPromise;
if (download) {
  const path = await download.path();
  if (path) {
    writeFileSync(resolve(SECRETS_DIR, "google-credentials.json"), readFileSync(path, "utf8"));
    console.log("SAVED from download:", path);
    await browser.close();
    process.exit(0);
  }
}

await page.waitForTimeout(5000);
const files = readdirSync(SECRETS_DIR).filter((f) => f.endsWith(".json") && f.includes("client"));
console.log("client json files in secrets:", files);

const body = await page.innerText("body");
const secret = body.match(/GOCSPX-[A-Za-z0-9_-]+/)?.[0];
if (secret) {
  const creds = {
    installed: {
      client_id: `${CLIENT_ID}.apps.googleusercontent.com`,
      client_secret: secret,
      project_id: PROJECT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      redirect_uris: ["http://localhost"],
    },
  };
  writeFileSync(resolve(SECRETS_DIR, "google-credentials.json"), JSON.stringify(creds, null, 2));
  console.log("SAVED from page secret");
  await browser.close();
  process.exit(0);
}

await page.screenshot({ path: resolve(SECRETS_DIR, "gcp-client-download.png") });
throw new Error("Download JSON not captured");
