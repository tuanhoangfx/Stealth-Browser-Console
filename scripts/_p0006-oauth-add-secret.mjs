import { chromium } from "playwright-core";
import { writeFileSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const DEBUG_PORT = parseInt(process.env.P0003_DEBUG_PORT || "51169", 10);
const PROJECT_ID = "our-foundry-442305-d3";
const CLIENT_ID = process.env.P0006_OAUTH_CLIENT_ID || "1063839152855-cr5thq8m3qfnao6u3o8vsn8bq1c01cfa";
const SECRETS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "P0006-Content-Studio", "worker", "secrets");

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
const page = browser.contexts()[0].pages()[0] || (await browser.contexts()[0].newPage());
const url = `https://console.cloud.google.com/auth/clients/${CLIENT_ID}.apps.googleusercontent.com?project=${PROJECT_ID}`;
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(8000);

const addSecret = page.getByRole("button", { name: /add secret/i });
if (await addSecret.count()) {
  await addSecret.first().click({ force: true });
  await page.waitForTimeout(4000);
}

let body = await page.innerText("body");
let secret = body.match(/GOCSPX-[A-Za-z0-9_-]+/)?.[0];
console.log("secret after add:", secret || "NOT_FOUND");

if (!secret) {
  const confirm = page.getByRole("button", { name: /create|add|confirm|ok/i });
  if (await confirm.count()) {
    await confirm.last().click({ force: true });
    await page.waitForTimeout(4000);
    body = await page.innerText("body");
    secret = body.match(/GOCSPX-[A-Za-z0-9_-]+/)?.[0];
    console.log("secret after confirm:", secret || "NOT_FOUND");
  }
}

const clientId = body.match(/(\d+-[a-z0-9]+\.apps\.googleusercontent\.com)/)?.[1] || `${CLIENT_ID}.apps.googleusercontent.com`;
if (!secret) {
  await page.screenshot({ path: resolve(SECRETS_DIR, "gcp-add-secret.png") });
  throw new Error("Could not read client secret from GCP page");
}

const creds = {
  installed: {
    client_id: clientId,
    client_secret: secret,
    project_id: PROJECT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    redirect_uris: ["http://localhost"],
  },
};

writeFileSync(resolve(SECRETS_DIR, "google-credentials.json"), JSON.stringify(creds, null, 2));
console.log("SAVED google-credentials.json for", clientId);
await browser.close();
