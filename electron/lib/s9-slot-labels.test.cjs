"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  formatSlotsMarkdownTable,
  getS9SlotLabels,
  sanitizeSlotEntry,
  updateS9SlotLabel,
} = require("./s9-slot-labels.cjs");

test("sanitizeSlotEntry pads valid P0020 browser codes and rejects forbidden 8xxx customer slots", () => {
  const clean = sanitizeSlotEntry({ tag: "Thái Zalo", zalo: "0973648075", fb: "fb.com/thai", browserCode: "49" });
  assert.equal(clean.tag, "Thái Zalo");
  assert.equal(clean.browserCode, "0049");

  assert.throws(
    () => sanitizeSlotEntry({ tag: "Customer", browserCode: "8105" }),
    /8000-8999 is forbidden/,
  );
});

test("updateS9SlotLabel persists, clears, and formats Markdown table cleanly", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "s9-labels-test-"));
  const filePath = path.join(tmpDir, "slot-labels.json");
  try {
    const saved1 = await updateS9SlotLabel(
      { userId: 0, tag: "Main Gateway", zalo: "0973648075", fb: "Infi Care", browserCode: "0049" },
      { filePath, syncCloud: false, enrichVault: false },
    );
    assert.equal(saved1.ok, true);
    assert.equal(saved1.slots["0"].tag, "Main Gateway");

    await updateS9SlotLabel(
      { userId: 95, tag: "Dual Backup", zalo: "0961739602" },
      { filePath, syncCloud: false, enrichVault: false },
    );

    const loaded = await getS9SlotLabels({ filePath, enrichVault: false });
    assert.equal(loaded.slots["0"].browserCode, "0049");
    assert.equal(loaded.slots["95"].tag, "Dual Backup");

    const md = formatSlotsMarkdownTable(loaded.slots);
    assert.match(md, /\| 01 \(U0\) \| Main Gateway \| 0973648075 \| Infi Care \| #0049 \|/);
    assert.match(md, /\| U95 \(Dual\) \| Dual Backup \| 0961739602 \| - \| - \|/);

    const cleared = await updateS9SlotLabel(
      { userId: 0, clear: true },
      { filePath, syncCloud: false, enrichVault: false },
    );
    assert.equal(cleared.slots["0"], undefined);
    assert.equal(cleared.slots["95"].tag, "Dual Backup");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
