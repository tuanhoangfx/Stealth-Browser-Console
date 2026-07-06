import { chromium } from "playwright-core";

const browser = await chromium.connectOverCDP(`http://127.0.0.1:51169`);
const page = browser.contexts()[0].pages()[0];
const url =
  "https://console.cloud.google.com/auth/clients/1063839152855-cr5thq8m3qfnao6u3o8vsn8bq1c01cfa.apps.googleusercontent.com?project=our-foundry-442305-d3";
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(8000);

const info = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("button, a, mat-icon, cfc-icon, [role=button]")) {
    const text = (el.textContent || "").trim();
    const aria = el.getAttribute("aria-label") || "";
    const title = el.getAttribute("title") || "";
    const mat = el.getAttribute("data-mat-icon-name") || "";
    if (/download|json|copy|secret/i.test(`${text} ${aria} ${title} ${mat}`)) {
      out.push({ tag: el.tagName, text: text.slice(0, 50), aria, title, mat });
    }
  }
  return out;
});
console.log(JSON.stringify(info, null, 2));

const rows = await page.evaluate(() =>
  [...document.querySelectorAll("tr, [role=row], cfc-table-row")].map((r) => (r.textContent || "").replace(/\s+/g, " ").trim()).filter((t) => /secret|GOCSPX|\*\*\*\*/i.test(t)),
);
console.log("rows", rows);

await browser.close();
