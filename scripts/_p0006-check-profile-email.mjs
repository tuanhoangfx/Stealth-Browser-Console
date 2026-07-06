import { chromium } from "playwright-core";

const port = parseInt(process.argv[2] || "53214", 10);
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const page = browser.contexts()[0].pages()[0] || (await browser.contexts()[0].newPage());
await page.goto("https://myaccount.google.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(4000);
const body = await page.innerText("body");
const email = body.match(/[a-zA-Z0-9._%+-]+@(?:gmail|googlemail)\.com/i)?.[0] || "unknown";
console.log(JSON.stringify({ port, email, url: page.url() }));
await browser.close();
