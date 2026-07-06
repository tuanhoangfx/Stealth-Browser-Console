import { chromium } from "playwright-core";
import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const DEBUG_PORT = parseInt(process.env.P0003_DEBUG_PORT || "51169", 10);
const PROJECT_ID = "our-foundry-442305-d3";
const CLIENT_ID = "1063839152855-bq5q8q2nvi8tutat9hicoef0q0r58au6";
const SECRETS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "P0006-Content-Studio", "worker", "secrets");
mkdirSync(SECRETS_DIR, { recursive: true });

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
const context = browser.contexts()[0];
const page = context.pages().find((p) => p.url().includes("google")) || (await context.newPage());

const clientUrl = `https://console.cloud.google.com/auth/clients/${CLIENT_ID}.apps.googleusercontent.com?project=${PROJECT_ID}`;
await page.goto(clientUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(8000);

let bodyText = await page.locator("body").innerText();
let secretMatch = bodyText.match(/GOCSPX-[A-Za-z0-9_-]+/);
const clientIdMatch = bodyText.match(/(\d+-[a-z0-9]+\.apps\.googleusercontent\.com)/);

if (!secretMatch) {
  const dlBtn = page.locator("button, a").filter({ hasText: /download json/i });
  if (await dlBtn.count()) {
    const downloadPromise = page.waitForEvent("download", { timeout: 20000 }).catch(() => null);
    await dlBtn.first().click({ force: true });
    const download = await downloadPromise;
    if (download) {
      const path = await download.path();
      if (path) {
        writeFileSync(resolve(SECRETS_DIR, "google-credentials.json"), readFileSync(path, "utf8"));
        console.log("SAVED google-credentials.json from download");
        await browser.close();
        process.exit(0);
      }
    }
  }
}

console.log("Client ID:", clientIdMatch?.[1]);
console.log("Secret:", secretMatch?.[0] || "NOT_FOUND");

if (clientIdMatch && secretMatch) {
  writeFileSync(
    resolve(SECRETS_DIR, "google-credentials.json"),
    JSON.stringify(
      {
        installed: {
          client_id: clientIdMatch[1],
          client_secret: secretMatch[0],
          project_id: PROJECT_ID,
          auth_uri: "https://accounts.google.com/o/oauth2/auth",
          token_uri: "https://oauth2.googleapis.com/token",
          auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
          redirect_uris: ["http://localhost"],
        },
      },
      null,
      2,
    ),
  );
  console.log("SAVED google-credentials.json");
}

await browser.close();
