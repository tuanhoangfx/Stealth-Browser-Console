"use strict";
const fs = require("node:fs");
const os = require("node:os");

function dbg(label, data) {
  try { fs.appendFileSync(os.tmpdir() + "/fb-debug.txt", `[FB] ${label}: ${JSON.stringify(data)}\n`); } catch {}
}

async function createFacebookPage(context, pageName) {
  const page = await context.newPage();
  try { fs.writeFileSync(os.tmpdir() + "/fb-debug.txt", `=== ${new Date().toISOString()} name=${pageName} ===\n`); } catch {}

  // Click [role="button"] matching text — log all found + any click errors
  async function clickRoleButton(textPatterns, timeout = 6000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const buttons = await page.locator('[role="button"]').all();
      for (const btn of buttons) {
        try {
          if (!await btn.isVisible({ timeout: 300 }).catch(() => false)) continue;
          const disabled = await btn.getAttribute("aria-disabled").catch(() => null);
          if (disabled === "true") continue;
          const txt = (await btn.innerText().catch(() => "")).trim();
          if (!txt) continue;
          if (textPatterns.some(p => txt.toLowerCase().includes(p.toLowerCase()))) {
            await btn.click({ timeout: 3000 });
            dbg("clicked", txt);
            return true;
          }
        } catch (e) {
          dbg("click_err", String(e).slice(0, 120));
        }
      }
      await page.waitForTimeout(400);
    }
    // Dump all role=button for debugging
    const all = await page.locator('[role="button"]').all();
    const dump = await Promise.all(all.map(async b => {
      const txt = (await b.innerText().catch(() => "")).trim().slice(0, 60);
      const dis = await b.getAttribute("aria-disabled").catch(() => null);
      const vis = await b.isVisible().catch(() => false);
      return { txt, dis, vis };
    }));
    dbg("role_buttons_dump", dump.filter(x => x.txt));
    return false;
  }

  // Fill category và chọn option đầu tiên trong dropdown
  async function fillCategory() {
    const catSel = [
      '[aria-label="Hạng mục (Bắt buộc)"]',
      '[aria-label*="Hạng mục"]',
      '[aria-label*="Category"]',
      'input[type="search"]:not([aria-label*="Tìm kiếm"])',
    ];

    for (const sel of catSel) {
      try {
        const el = page.locator(sel).first();
        if (!await el.isVisible({ timeout: 2000 }).catch(() => false)) continue;

        await el.click();
        await el.fill("");
        await page.waitForTimeout(200);

        // Dùng keyboard type để trigger React autocomplete
        await page.keyboard.type("Cộng đồng", { delay: 80 });
        await page.waitForTimeout(1200);

        // Nếu không thấy option với "Cộng đồng", thử "Community"
        let opt = page.locator('[role="option"]').first();
        if (!await opt.isVisible({ timeout: 1500 }).catch(() => false)) {
          await el.fill("");
          await page.keyboard.type("Community", { delay: 80 });
          await page.waitForTimeout(1200);
          opt = page.locator('[role="option"]').first();
        }

        if (await opt.isVisible({ timeout: 2000 }).catch(() => false)) {
          const optText = await opt.innerText().catch(() => "");
          await opt.click();
          dbg("category_selected", { sel, optText });
          await page.waitForTimeout(600);
          return true;
        }

        // Nếu không có dropdown, thử Press Enter
        await page.keyboard.press("Enter");
        await page.waitForTimeout(500);
        dbg("category_enter_pressed", sel);
        return true;

      } catch (e) {
        dbg("category_err", String(e).slice(0, 100));
      }
    }
    return false;
  }

  try {
    await page.goto("https://www.facebook.com/pages/creation/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(3500);

    const url = page.url();
    if (url.includes("/login") || url.includes("checkpoint")) {
      throw new Error("Chưa đăng nhập Facebook trong profile này");
    }
    dbg("url", url);

    // ── Bước 1: Tên Page ─────────────────────────────────────────────────
    const nameEl = page.locator('input[type="text"]:not([aria-label])').first();
    const nameVisible = await nameEl.isVisible({ timeout: 5000 }).catch(() => false);
    if (!nameVisible) {
      // Fallback: lấy input[type="text"] bất kỳ
      const fb = page.locator('input[type="text"]').first();
      await fb.click({ clickCount: 3 });
      await fb.fill(pageName);
    } else {
      await nameEl.click({ clickCount: 3 });
      await nameEl.fill(pageName);
    }
    dbg("name_filled", pageName);
    await page.waitForTimeout(700);

    // ── Bước 2: Category ──────────────────────────────────────────────────
    const catOk = await fillCategory();
    dbg("category_ok", catOk);
    await page.waitForTimeout(500);

    // ── Bước 3: Tiếp theo (nếu multi-step) ───────────────────────────────
    const nextOk = await clickRoleButton(["Tiếp theo", "Next", "Continue"], 2000);
    if (nextOk) {
      await page.waitForTimeout(1500);
      await clickRoleButton(["Tiếp theo", "Next", "Continue"], 1500).catch(() => {});
      await page.waitForTimeout(800);
    }

    // ── Bước 4: Tạo Trang ────────────────────────────────────────────────
    const createOk = await clickRoleButton(["Tạo Trang", "Tạo trang", "Create Page", "Create"], 10000);
    if (!createOk) {
      const debugContent = fs.readFileSync(os.tmpdir() + "/fb-debug.txt", "utf8").slice(-1800);
      throw new Error(`Không tìm thấy/click được nút Tạo Trang:\n${debugContent}`);
    }

    // Facebook shows setup wizard at /pages/creation/ after creation.
    // Strategy: actively skip wizard steps, then navigate to the new page.
    await page.waitForTimeout(3000);

    /** Extract page URL from current page state */
    async function extractPageUrl() {
      // 1. URL navigated away from creation
      const cur = page.url();
      if (cur.includes("facebook.com") && !cur.includes("/pages/creation/") && !cur.includes("/login")) {
        return cur;
      }

      // 2. "Xem Trang" / "View Page" link (anchor with href)
      const viewPatterns = ["Xem Trang", "View Page", "Xem trang", "Truy cập Trang", "Đến Trang", "Go to Page", "Visit Page"];
      for (const pat of viewPatterns) {
        try {
          const a = page.locator(`a:has-text("${pat}")`).first();
          if (await a.isVisible({ timeout: 600 }).catch(() => false)) {
            const href = await a.getAttribute("href").catch(() => null);
            if (href && href.includes("facebook.com") && !href.includes("/pages/creation/")) {
              return href.startsWith("http") ? href : `https://www.facebook.com${href}`;
            }
          }
        } catch {}
      }

      // 3. Scan all links for page ID patterns
      const allLinks = await page.locator("a[href]").evaluateAll(els =>
        els.map(e => e.href).filter(h => h && h.includes("facebook.com"))
      ).catch(() => []);

      const profileLink = allLinks.find(h => h.includes("profile.php?id="));
      if (profileLink) return profileLink;

      const numericLink = allLinks.find(h => /facebook\.com\/\d{6,}/.test(h));
      if (numericLink) return numericLink;

      const pagesLink = allLinks.find(h =>
        h.includes("/pages/") &&
        !h.includes("/creation/") &&
        !h.includes("/help/") &&
        !h.endsWith("/pages/")
      );
      if (pagesLink) return pagesLink;

      // 4. Search page HTML for numeric page ID
      const bodyHTML = await page.evaluate(() => document.body.innerHTML.slice(0, 80000)).catch(() => "");
      const idMatch = bodyHTML.match(/"page_id"\s*:\s*"(\d{10,})"|"pageID"\s*:\s*"(\d{10,})"|"id"\s*:\s*"(\d{10,})"/);
      if (idMatch) {
        const id = idMatch[1] || idMatch[2] || idMatch[3];
        if (id) return `https://www.facebook.com/profile.php?id=${id}`;
      }

      return null;
    }

    let finalUrl = "";

    // Loop: skip wizard steps until we can extract a real page URL (max 30s)
    const SKIP_PATTERNS = [
      "Bỏ qua", "Bỏ qua bước này", "Skip", "Bỏ qua tất cả",
      "Xong", "Done", "Hoàn tất", "Finish",
    ];
    const deadline = Date.now() + 30000;

    while (Date.now() < deadline && !finalUrl) {
      const extracted = await extractPageUrl();
      if (extracted) {
        finalUrl = extracted;
        dbg("extracted_url", finalUrl);
        break;
      }

      // Try clicking a skip/done button in the wizard
      let skipped = false;
      for (const pat of SKIP_PATTERNS) {
        try {
          const el = page.locator(`[role="button"]:has-text("${pat}"), button:has-text("${pat}")`).first();
          if (await el.isVisible({ timeout: 400 }).catch(() => false)) {
            await el.click();
            dbg("wizard_skip", pat);
            await page.waitForTimeout(1500);
            skipped = true;
            break;
          }
        } catch {}
      }

      if (!skipped) {
        // No skip button found — wait and retry
        await page.waitForTimeout(1200);
      }
    }

    // Last resort: dump links for debug and use current URL
    if (!finalUrl) {
      const allLinks = await page.locator("a[href]").evaluateAll(els =>
        els.map(e => ({ href: e.href, text: (e.innerText || "").trim().slice(0, 40) }))
          .filter(l => l.href.includes("facebook.com"))
      ).catch(() => []);
      dbg("fallback_links_dump", allLinks.slice(0, 20));
      finalUrl = page.url();
      dbg("fallback_url", finalUrl);
    }

    dbg("final_url", finalUrl);
    return { url: finalUrl };
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { createFacebookPage };
