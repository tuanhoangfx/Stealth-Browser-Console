import { chromium } from "playwright-core";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const PROJECT_ID = "our-foundry-442305-d3";
const CLIENT_NAME = `P0006-CS-${Date.now().toString(36).slice(-4)}`;
const SECRETS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "P0006-Content-Studio", "worker", "secrets");

const browser = await chromium.connectOverCDP("http://127.0.0.1:51169");
const context = browser.contexts()[0];
const page = context.pages()[0] || (await context.newPage());
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");

let capturedSecret = "";
cdp.on("Network.responseReceived", async (params) => {
  try {
    const body = await cdp.send("Network.getResponseBody", { requestId: params.requestId });
    const text = body.base64Encoded ? Buffer.from(body.body, "base64").toString("utf8") : body.body;
    const m = text.match(/GOCSPX-[A-Za-z0-9_-]+/);
    if (m) capturedSecret = m[0];
  } catch {
    // ignore non-text bodies
  }
});

await page.goto(`https://console.cloud.google.com/auth/clients/create?project=${PROJECT_ID}`, {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(6000);
await page.locator("cfc-select[role=combobox]").click({ force: true });
await page.waitForTimeout(1000);
await page.locator('[role=option]').filter({ hasText: "Desktop app" }).first().click({ force: true });
await page.waitForTimeout(1500);
await page.locator('input[formcontrolname="displayName"]').fill(CLIENT_NAME);
await page.locator("button").filter({ hasText: "Create" }).last().click({ force: true });
await page.getByRole("heading", { name: "OAuth client created" }).waitFor({ timeout: 30000 });

const dialog = page.locator("mat-dialog-container").last();
const dialogText = await dialog.innerText();
const clientId = dialogText.match(/(\d+-[a-z0-9]+\.apps\.googleusercontent\.com)/)?.[1];
const dialogSecret = dialogText.match(/GOCSPX-[A-Za-z0-9_-]+/)?.[0];

await cdp.send("Browser.setDownloadBehavior", {
  behavior: "allow",
  downloadPath: SECRETS_DIR.replace(/\\/g, "/"),
  eventsEnabled: true,
});

const dl = page.waitForEvent("download", { timeout: 20000 }).catch(() => null);
await dialog.getByText("Download JSON").click({ force: true });
await dl;
await page.waitForTimeout(3000);

const secret = dialogSecret || capturedSecret;
console.log("clientId:", clientId);
console.log("secret:", secret || "NOT_FOUND");

if (clientId && secret) {
  writeFileSync(
    resolve(SECRETS_DIR, "google-credentials.json"),
    JSON.stringify(
      {
        installed: {
          client_id: clientId,
          client_secret: secret,
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
  await browser.close();
  process.exit(0);
}

await page.screenshot({ path: resolve(SECRETS_DIR, "gcp-create-final.png") });
throw new Error("No secret captured");
