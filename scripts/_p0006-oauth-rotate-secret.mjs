import { chromium } from "playwright-core";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const PROJECT_ID = "our-foundry-442305-d3";
const CLIENT_ID = "1063839152855-cr5thq8m3qfnao6u3o8vsn8bq1c01cfa";
const SECRETS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "P0006-Content-Studio", "worker", "secrets");

const browser = await chromium.connectOverCDP("http://127.0.0.1:51169");
const page = browser.contexts()[0].pages()[0];
const url = `https://console.cloud.google.com/auth/clients/${CLIENT_ID}.apps.googleusercontent.com?project=${PROJECT_ID}`;
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(8000);

const disableBtns = page.getByRole("button", { name: "Disable client secret" });
const count = await disableBtns.count();
console.log("disable buttons:", count);
if (count > 0) {
  await disableBtns.first().click({ force: true });
  await page.waitForTimeout(2000);
  const confirm = page.getByRole("button", { name: /^Disable$/i });
  if (await confirm.count()) await confirm.last().click({ force: true });
  await page.waitForTimeout(3000);
}

const add = page.getByRole("button", { name: "Add client secret" });
if (!(await add.count())) throw new Error("Add client secret button not found");
await add.click({ force: true });
await page.waitForTimeout(5000);

const dialog = page.locator("mat-dialog-container, [role=dialog]").last();
const dialogText = await dialog.innerText().catch(() => page.innerText("body"));
console.log("dialog:", dialogText.slice(0, 800));

const secret = dialogText.match(/GOCSPX-[A-Za-z0-9_-]+/)?.[0];
if (!secret) {
  await page.screenshot({ path: resolve(SECRETS_DIR, "gcp-new-secret-dialog.png") });
  throw new Error("Secret not visible in Add secret dialog");
}

writeFileSync(
  resolve(SECRETS_DIR, "google-credentials.json"),
  JSON.stringify(
    {
      installed: {
        client_id: `${CLIENT_ID}.apps.googleusercontent.com`,
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
console.log("SAVED google-credentials.json with new secret");
await browser.close();
