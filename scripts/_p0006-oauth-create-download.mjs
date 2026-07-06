import { chromium } from "playwright-core";
import { writeFileSync, readFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const DEBUG_PORT = parseInt(process.env.P0003_DEBUG_PORT || "51169", 10);
const PROJECT_ID = "our-foundry-442305-d3";
const CLIENT_NAME = `P0006-Content-Studio-${Date.now().toString(36).slice(-4)}`;
const SECRETS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "P0006-Content-Studio", "worker", "secrets");

mkdirSync(SECRETS_DIR, { recursive: true });

function newestJsonIn(dir) {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json") && f.includes("client"))
      .map((f) => ({ f, m: statSync(resolve(dir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m)[0]?.f;
  } catch {
    return null;
  }
}

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
const context = browser.contexts()[0];
const page = context.pages().find((p) => p.url().includes("google")) || (await context.newPage());
const cdp = await context.newCDPSession(page);
await cdp.send("Browser.setDownloadBehavior", {
  behavior: "allow",
  downloadPath: SECRETS_DIR.replace(/\\/g, "/"),
  eventsEnabled: true,
});

await page.goto(`https://console.cloud.google.com/auth/clients/create?project=${PROJECT_ID}`, {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(6000);

for (const label of ["Dismiss", "Got it"]) {
  const btn = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") });
  if (await btn.count()) await btn.first().click({ force: true }).catch(() => undefined);
}

await page.locator("cfc-select[role=combobox]").click({ force: true });
await page.waitForTimeout(1200);
await page.locator('[role=option]').filter({ hasText: "Desktop app" }).first().click({ force: true });
await page.waitForTimeout(1500);
await page.locator('input[formcontrolname="displayName"]').fill(CLIENT_NAME);
await page.waitForTimeout(800);

const downloadPromise = page.waitForEvent("download", { timeout: 45000 }).catch(() => null);
await page.locator("button").filter({ hasText: "Create" }).last().click({ force: true });
await page.getByRole("heading", { name: "OAuth client created" }).waitFor({ timeout: 30000 });

const dialog = page.locator("mat-dialog-container, .mat-mdc-dialog-container").last();
const dialogText = await dialog.innerText();
const idMatch = dialogText.match(/(\d+-[a-z0-9]+\.apps\.googleusercontent\.com)/);
const secretMatch = dialogText.match(/GOCSPX-[A-Za-z0-9_-]+/);

const dlBtn = dialog.getByText("Download JSON");
if (await dlBtn.count()) await dlBtn.click({ force: true });

const download = await downloadPromise;
if (download) {
  const path = await download.path();
  if (path) {
    writeFileSync(resolve(SECRETS_DIR, "google-credentials.json"), readFileSync(path, "utf8"));
    console.log("SAVED from playwright download:", path);
    await browser.close();
    process.exit(0);
  }
}

await page.waitForTimeout(4000);
const saved = newestJsonIn(SECRETS_DIR);
if (saved) {
  const content = readFileSync(resolve(SECRETS_DIR, saved), "utf8");
  writeFileSync(resolve(SECRETS_DIR, "google-credentials.json"), content);
  console.log("SAVED from secrets dir:", saved);
  await browser.close();
  process.exit(0);
}

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
  console.log("SAVED from dialog text");
  await browser.close();
  process.exit(0);
}

console.log("clientId:", idMatch?.[1]);
console.log("secret:", secretMatch?.[0] || "NOT_FOUND");
throw new Error("Could not obtain google-credentials.json");
