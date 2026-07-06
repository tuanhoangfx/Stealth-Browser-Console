import { chromium } from "playwright-core";
import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const DEBUG_PORT = parseInt(process.env.P0003_DEBUG_PORT || "51169", 10);
const PROJECT_ID = "our-foundry-442305-d3";
const CLIENT_NAME = `P0006-Content-Studio-${Date.now().toString(36).slice(-4)}`;
const SECRETS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "P0006-Content-Studio", "worker", "secrets");
mkdirSync(SECRETS_DIR, { recursive: true });

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
const context = browser.contexts()[0];
const page = context.pages().find((p) => p.url().includes("google")) || (await context.newPage());

await page.goto(`https://console.cloud.google.com/auth/clients/create?project=${PROJECT_ID}`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(6000);

await page.locator("mat-select").first().click({ force: true });
await page.waitForTimeout(1500);
await page.locator('mat-option:has-text("Desktop")').first().click({ force: true });
await page.waitForTimeout(2000);

const nameField = page.locator('input[formcontrolname="displayName"]');
await nameField.waitFor({ timeout: 15000 });
await nameField.fill(CLIENT_NAME);
await page.waitForTimeout(1000);

const downloadPromise = page.waitForEvent("download", { timeout: 30000 }).catch(() => null);
await page.locator("button").filter({ hasText: /^Create$/ }).last().click({ force: true });

try {
  await page.getByText("OAuth client created").waitFor({ timeout: 25000 });
} catch {
  console.log("No success dialog — body:", (await page.locator("body").innerText()).slice(0, 500));
}

const dlBtn = page.getByText("Download JSON");
if (await dlBtn.count()) {
  await dlBtn.click({ force: true });
}

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

const text = await page.locator("body").innerText();
const idMatch = text.match(/(\d+-[a-z0-9]+\.apps\.googleusercontent\.com)/);
const secretMatch = text.match(/GOCSPX-[A-Za-z0-9_-]+/);
console.log("Client ID:", idMatch?.[1]);
console.log("Secret:", secretMatch?.[0] || "NOT_FOUND");

if (idMatch && secretMatch) {
  writeFileSync(
    resolve(SECRETS_DIR, "google-credentials.json"),
    JSON.stringify(
      {
        installed: {
          client_id: idMatch[1],
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
  console.log("SAVED google-credentials.json from dialog text");
}

await browser.close();
