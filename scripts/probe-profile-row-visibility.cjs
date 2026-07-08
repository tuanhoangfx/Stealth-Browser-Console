"use strict";
const { app, BrowserWindow } = require("electron");
const path = require("path");

const root = path.join(__dirname, "..");
const probe = async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(root, "electron", "preload.cjs"), contextIsolation: true },
  });
  await win.loadFile(path.join(root, "dist", "index.html"), { query: { stealthSmokePager: "1" } });
  for (let i = 0; i < 30; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    const ready = await win.webContents.executeJavaScript(`
      document.querySelectorAll('.stealth-profile-directory-frame tbody tr:not(.hub-users-row--pad)').length
    `);
    if (Number(ready) >= 20) break;
  }
  return win.webContents.executeJavaScript(`
    (() => {
      const pageSize = 20;
      const frame = document.querySelector('.stealth-profile-directory-frame');
      const table = frame?.querySelector('table.hub-directory-frame-table');
      const shell = frame?.querySelector('.hub-paginated-table-shell');
      const pager = frame?.querySelector('.hub-table-pager');
      if (!table || !shell) return { ok: false, reason: 'missing-dom' };
      const shellRect = shell.getBoundingClientRect();
      const pagerTop = pager?.getBoundingClientRect().top ?? shellRect.bottom;
      const dataRows = [...table.querySelectorAll('tbody tr:not(.hub-users-row--pad)')];
      const visible = dataRows.filter((row) => {
        const r = row.getBoundingClientRect();
        return r.height > 0 && r.top >= shellRect.top - 2 && r.bottom <= pagerTop + 2;
      });
      const row20 = dataRows[19]?.getBoundingClientRect();
      return {
        ok: dataRows.length >= pageSize && visible.length >= pageSize,
        domDataRows: dataRows.length,
        visibleDataRows: visible.length,
        shellH: Math.round(shellRect.height),
        row20Bottom: row20 ? Math.round(row20.bottom) : null,
        pagerTop: Math.round(pagerTop),
      };
    })()
  `);
};

app.whenReady().then(async () => {
  try {
    const result = await probe();
    console.log(JSON.stringify(result));
    app.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    app.exit(1);
  }
});
