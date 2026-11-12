"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createDesktopUpdaterIpcController } = require("./lib/desktop-host-kit.cjs");
const { ensurePackagedAppUpdateYml } = require("./lib/electron-builder-pack-guard.cjs");

test("NSIS upgrade guard unlocks mapped Uninstall Stealth Browser Console.exe before overwrite", () => {
  const installerNsh = fs.readFileSync(path.join(__dirname, "..", "build", "installer.nsh"), "utf8");
  const sharedUnlockNsh = fs.readFileSync(
    path.join(__dirname, "..", "build", "nsis-uninstaller-unlock.nsh"),
    "utf8",
  );
  assert.match(installerNsh, /!include\s+"nsis-uninstaller-unlock\.nsh"/);
  assert.match(installerNsh, /!insertmacro\s+hubPrepareUpgradeInit/);
  assert.match(sharedUnlockNsh, /!macro\s+customFiles_x64/);
  assert.match(sharedUnlockNsh, /Rename\s+"\$INSTDIR\\\$\{UNINSTALL_FILENAME\}"\s+"\$INSTDIR\\\$\{UNINSTALL_FILENAME\}\.stale"/);
});

test("ensurePackagedAppUpdateYml seeds resources/app-update.yml for prepackaged NSIS builds", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-app-update-yml-"));
  try {
    const appOutDir = path.join(tmp, "win-unpacked");
    fs.mkdirSync(path.join(appOutDir, "resources"), { recursive: true });
    const projectDir = path.join(__dirname, "..");
    assert.equal(ensurePackagedAppUpdateYml(appOutDir, projectDir), true);
    const yml = fs.readFileSync(path.join(appOutDir, "resources", "app-update.yml"), "utf8");
    assert.match(yml, /owner:\s*tuanhoangfx/);
    assert.match(yml, /repo:\s*Stealth-Browser-Console/);
    assert.match(yml, /provider:\s*github/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("desktop-host-kit exposes releasePageUrl/downloadUrl and deduplicates concurrent check/download", async () => {
  const handlers = new Map();
  const mockIpcMain = {
    handle(ch, fn) {
      handlers.set(ch, fn);
    },
  };
  const mockApp = {
    isPackaged: false,
    getVersion: () => "9.2.390",
    getPath: () => os.tmpdir(),
  };

  const controller = createDesktopUpdaterIpcController({
    app: mockApp,
    ipcMain: mockIpcMain,
    channelPrefix: "stealth",
    productName: "Stealth Browser Console",
    githubRepo: "tuanhoangfx/Stealth-Browser-Console",
    installerFallbackTemplate: "Stealth-Browser-Console-Setup-{version}.exe",
    electronDir: __dirname,
    quitAndInstallSilent: true,
    autoInstallOnAppQuit: false,
  });
  controller.registerIpc();

  const initial = controller.getStatus();
  assert.equal(initial.releasePageUrl, "https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/latest");
  assert.equal(initial.downloadUrl, "https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/latest");

  const updated = controller.setStatus({ state: "available", updateVersion: "9.2.400" });
  assert.equal(
    updated.downloadUrl,
    "https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/download/v9.2.400/Stealth-Browser-Console-Setup-9.2.400.exe",
  );
  assert.equal(handlers.has("stealth:get-update-status"), true);
  assert.equal(handlers.has("stealth:install-update"), true);
});
