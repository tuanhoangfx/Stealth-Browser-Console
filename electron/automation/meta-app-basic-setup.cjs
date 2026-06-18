const { settlePage } = require("./script-steps.cjs");

/**
 * Fill Basic settings required for OAuth (website URL, privacy, app domain).
 */
async function setupAppBasic(context, { appId, siteUrl = "https://chathub.infi.io.vn", privacyUrl = "https://chathub.infi.io.vn/privacy" } = {}) {
  const id = String(appId || "").trim();
  if (!id) throw new Error("appId is required");

  const page = context.pages()[0] || (await context.newPage());
  const basicUrl = `https://developers.facebook.com/apps/${id}/settings/basic/`;
  await page.goto(basicUrl, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForTimeout(8000);

  const domain = new URL(siteUrl).hostname;
  const fields = [
    { label: /Miền ứng dụng|App Domains/i, value: domain },
    { label: /URL chính sách quyền riêng tư|Privacy Policy URL/i, value: privacyUrl },
    { label: /URL điều khoản dịch vụ|Terms of Service URL/i, value: privacyUrl },
    { label: /URL trang web|Site URL|Website/i, value: siteUrl.replace(/\/$/, "") + "/" },
  ];

  const touched = [];
  for (const { label, value } of fields) {
    const input = page.getByRole("textbox", { name: label }).or(page.locator(`input[aria-label*="domain"], input[placeholder*="${domain}"]`));
    if ((await input.count()) === 0) continue;
    const el = input.first();
    const current = await el.inputValue().catch(() => "");
    if (current.includes(value.replace(/\/$/, "")) || current.includes(domain)) continue;
    await el.click();
    await el.fill(value);
    touched.push(value);
    await page.waitForTimeout(400);
  }

  const saveBtn = page.getByRole("button", { name: /Lưu thay đổi|Save changes/i });
  if (touched.length && (await saveBtn.count()) > 0) {
    await saveBtn.click();
    await settlePage(page, 5000);
  }

  return { ok: true, appId: id, touched, basicUrl };
}

module.exports = { setupAppBasic };
