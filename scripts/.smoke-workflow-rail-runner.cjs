
const fs = require("fs");
const { app, BrowserWindow } = require("electron");

const url = process.env.SMOKE_URL;
const outFile = process.env.SMOKE_OUT;
const railPageSize = 5;

app.commandLine.appendSwitch("disable-gpu");
app.whenReady().then(async () => {
  const logs = [];
  const win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });

  win.webContents.on("console-message", (_e, level, message) => {
    logs.push({ level, message });
  });

  let probe = { error: "not-run" };
  try {
    await win.loadURL(url, { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 6000));
    probe = await win.webContents.executeJavaScript(`
      (() => {
        const pageSize = ${railPageSize};
        const rail = document.querySelector(".stealth-workflow-rail");
        const boot = document.getElementById("hub-boot-loader");
        if (!rail) {
          return { ok: false, reason: "missing-rail", bootPresent: Boolean(boot) };
        }
        const rows = rail.querySelectorAll(".stealth-workflow-rail-table tbody tr");
        const rowCount = rows.length;
        const pageSizeBtn = [...rail.querySelectorAll("button")].find((b) =>
          /\\d+\\s*rows/i.test(b.textContent || ""),
        );
        const pagerText = rail.querySelector(".hub-table-pager")?.textContent?.trim() || "";
        const totalMatch = pagerText.match(/of\\s+(\\d+)/i);
        const catalogTotal = totalMatch ? Number(totalMatch[1]) : rowCount;
        const expectedRows = Math.min(pageSize, Math.max(catalogTotal, rowCount));
        const ok =
          !boot &&
          rowCount > 0 &&
          rowCount === expectedRows &&
          !pageSizeBtn;
        return {
          ok,
          rowCount,
          expectedRows,
          catalogTotal,
          pagerText,
          pageSizeBtnText: pageSizeBtn?.textContent || null,
          bootPresent: Boolean(boot),
        };
      })()
    `);
  } catch (err) {
    probe = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const errors = logs.filter((l) => l.level >= 2 || /error|Error|fail/i.test(l.message));
  const ok = Boolean(probe.ok);
  fs.writeFileSync(outFile, JSON.stringify({ url, ok, probe, errors: errors.slice(0, 20) }, null, 2));
  app.exit(ok ? 0 : 1);
});
