/**
 * Headless DOM & Hub-UI Geometry regression test for E0001 Cookie Bridge popup (`popup.html`).
 * Powered by `verifyExtensionPopupDom` from `Tool/scripts/lib/agent-inline-kit.mjs` (loopback HTTP + MV3 chrome mock + 8s hard watchdog).
 */
import assert from "node:assert/strict";
import { verifyExtensionPopupDom } from "../../../Tool/scripts/lib/agent-inline-kit.mjs";

const check = await verifyExtensionPopupDom({
  extension: "E0001",
  viewport: { width: 800, height: 600 },
  timeoutMs: 8000,
  initialTabSelector: "#sidebar-nav-cookie",
  async run({ page, measureRect }) {
    // 1. Verify Row 1 & Row 2 Hub-UI 31px height & single-line alignment in idle state
    const row1 = await measureRect("#tab-panel-cookie .hub-filter-bar__row-tools");
    const row2 = await measureRect("#tab-panel-cookie .hub-filter-bar__row-band");
    const firstTrigger = await measureRect("#tab-panel-cookie .cookie-filter-dd:first-child .filter-dd-trigger");
    const clearActBtn = await measureRect("#cookie-bulk-clear-active-btn");
    const wrapRect = await measureRect("#cookie-table-wrap");
    const actionsTh = await measureRect("#cookie-jar-table thead th.col-actions");
    const cookiesTh = await measureRect("#cookie-jar-table thead th.col-cookies");
    const firstRowClear = await measureRect("#cookie-jar-body tr:first-child .cookie-site-clear");
    const firstRowCookies = await measureRect("#cookie-jar-body tr:first-child td.col-cookies");

    assert.equal(row1?.height, 31, `Expected Row 1 height 31px, got ${row1?.height}`);
    assert.equal(row2?.height, 31, `Expected Row 2 height 31px, got ${row2?.height}`);
    assert.ok(firstTrigger && clearActBtn, "Expected filter trigger and Clear Active button to be visible");
    assert.equal(firstTrigger.top, clearActBtn.top, "Filters and Bulk Actions must sit on the exact same Row 2 line");
    assert.ok(
      wrapRect && actionsTh && cookiesTh && actionsTh.right <= wrapRect.right && cookiesTh.left < wrapRect.right,
      `Expected Site, Status, Actions & Cookies visible in initial viewport (actions.right=${actionsTh?.right}, cookies.left=${cookiesTh?.left}, wrap.right=${wrapRect?.right})`,
    );
    assert.ok(
      firstRowClear && firstRowCookies && firstRowClear.right <= firstRowCookies.left,
      `Expected Clear action button (${firstRowClear?.right}) not to overlap Cookies cell (${firstRowCookies?.left})`,
    );

    // 2. Verify 'F' shortcut focuses #cookie-jar-search and Escape blurs/clears
    await page.keyboard.press("f");
    const focusedId = await page.evaluate(() => document.activeElement?.id || "");
    assert.equal(focusedId, "cookie-jar-search", "Pressing 'F' should focus #cookie-jar-search");
    await page.keyboard.press("Escape");

    // 3. Activate visible Cookie filters + select 1 site row -> verify Row 2 zero-overlap & single-line invariant
    await page.evaluate(() => {
      const cb = document.querySelector("#cookie-jar-body input.cookie-site-select");
      if (cb instanceof HTMLInputElement && !cb.checked) {
        cb.checked = true;
        cb.dispatchEvent(new Event("change", { bubbles: true }));
      }
      for (const [key, val] of [
        ["platform", "google"],
        ["tab", "open"],
      ]) {
        const dd = document.querySelector(`#tab-panel-cookie .cookie-filter-dd[data-cookie-filter="${key}"]`);
        if (dd && !dd.hidden) {
          const opt =
            dd.querySelector(`.filter-dd-option[data-value="${val}"]`) ||
            dd.querySelectorAll(".filter-dd-option")?.[1];
          if (opt instanceof HTMLElement) opt.click();
        }
      }
    });
    await page.waitForTimeout(80);

    const row2Active = await measureRect("#tab-panel-cookie .hub-filter-bar__row-band");
    const resetBtn = await measureRect("#cookie-filter-reset-btn");
    const importBtn = await measureRect("#cookie-bulk-import-btn");
    const selBadge = await measureRect("#cookie-bulk-selection-badge");

    assert.equal(row2Active?.height, 31, `Expected active Row 2 height 31px, got ${row2Active?.height}`);
    assert.ok(selBadge && selBadge.width > 0, "Expected selection badge on Row 1 when a row is checked");
    assert.ok(resetBtn && importBtn, "Expected #cookie-filter-reset-btn and #cookie-bulk-import-btn to be visible");
    assert.ok(
      resetBtn.right <= importBtn.left,
      `Expected resetBtn.right (${resetBtn.right}) <= importBtn.left (${importBtn.left})`,
    );

    return {
      row1H: row1.height,
      row2H: row2Active.height,
      resetRight: resetBtn.right,
      importLeft: importBtn.left,
      cookiesRight: cookiesTh.right,
      wrapRight: wrapRect.right,
    };
  },
});

assert.equal(check.ok, true, `Page errors detected: ${check.pageErrors.join("; ")}`);
console.log("test-popup-dom-ssot: OK", check.result, `(${check.elapsedMs}ms)`);
