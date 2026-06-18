const { settlePage } = require("./script-steps.cjs");

/**
 * Add a Facebook user as app tester/developer (profile must be app admin).
 */
async function addAppTester(context, { appId, fbUserId, fbUserName, role = "testers" } = {}) {
  const id = String(appId || "").trim();
  const uid = String(fbUserId || "").trim();
  if (!id || !uid) throw new Error("appId and fbUserId required");

  const page = context.pages()[0] || (await context.newPage());
  const rolesUrl = `https://developers.facebook.com/apps/${id}/roles/roles/`;
  await page.goto(rolesUrl, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForTimeout(6000);

  const addBtn = page
    .getByRole("button", { name: /Thêm|Add|Add People/i })
    .or(page.locator('button:has-text("Add"), button:has-text("Thêm")'))
    .first();
  if ((await addBtn.count()) > 0) {
    await addBtn.click();
    await page.waitForTimeout(1500);
  }

  const input = page
    .getByRole("textbox")
    .or(page.locator('input[type="text"], input[placeholder*="Facebook"], input[aria-label*="Facebook"]'))
    .first();
  await input.waitFor({ state: "visible", timeout: 60_000 });
  const query = String(fbUserName || uid).trim();
  await input.fill("");
  await input.fill(query);
  await page.waitForTimeout(3000);

  const suggestion = page
    .locator('[role="option"], [role="listbox"] li, ul[role="listbox"] li')
    .filter({ hasText: new RegExp(uid.slice(0, 8)) })
    .first();
  if ((await suggestion.count()) > 0) {
    await suggestion.click();
    await page.waitForTimeout(1500);
  } else {
    await input.press("ArrowDown").catch(() => {});
    await page.waitForTimeout(800);
    await input.press("Enter").catch(() => {});
    await page.waitForTimeout(1500);
  }

  const roleSelect = page.getByRole("combobox", { name: /vai trò|role/i }).first();
  if ((await roleSelect.count()) > 0) {
    await roleSelect.click();
    await page.waitForTimeout(500);
    const testerOpt = page
      .getByRole("option", { name: /Người phát triển|Developer|Người thử nghiệm|Tester/i })
      .first();
    if ((await testerOpt.count()) > 0) await testerOpt.click();
  }

  const confirm = page.getByRole("button", { name: /Thêm|Add|Xác nhận|Confirm|Invite|Mời/i }).last();
  await confirm.waitFor({ state: "visible", timeout: 30_000 });
  for (let i = 0; i < 20; i++) {
    const disabled = await confirm.getAttribute("aria-disabled");
    if (disabled !== "true") break;
    await page.waitForTimeout(500);
  }
  if ((await confirm.getAttribute("aria-disabled")) !== "true") {
    await confirm.click();
    await settlePage(page, 4000);
  } else {
    await page.keyboard.press("Enter").catch(() => {});
    await settlePage(page, 3000);
  }

  const body = await page.locator("body").innerText().catch(() => "");
  const ok = body.includes(uid) || /đã thêm|added|invited/i.test(body);
  return { ok, appId: id, fbUserId: uid, rolesUrl };
}

module.exports = { addAppTester };
