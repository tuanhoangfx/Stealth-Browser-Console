"use strict";

/**
 * Make pnpm-isolated transitive deps resolvable from app.asar (tslib, fs-extra, …).
 *
 * Staging: electron/packaged-node_modules/node_modules/<pkg>
 * On MODULE_NOT_FOUND for a bare specifier, re-resolve with:
 *   originalResolveFilename(request, null, false, { paths: [vendor] })
 * (Node looks for <paths[i]>/node_modules/<name>. Do NOT call require.resolve
 * from inside the hook — that re-enters the patch and can mask success.)
 *
 * Must stay CommonJS and side-effect on load — required first from main.cjs.
 */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const vendor = path.join(__dirname, "..", "packaged-node_modules");
const appRoot = path.join(__dirname, "..", "..");
const asarRoot =
  typeof process.resourcesPath === "string" && process.resourcesPath
    ? path.join(process.resourcesPath, "app.asar")
    : "";
const asarVendor = asarRoot ? path.join(asarRoot, "electron", "packaged-node_modules") : "";
const unpackedRoot =
  typeof process.resourcesPath === "string" && process.resourcesPath
    ? path.join(process.resourcesPath, "app.asar.unpacked")
    : "";
const unpackedVendor = unpackedRoot ? path.join(unpackedRoot, "electron", "packaged-node_modules") : "";

const fallbackRoots = [appRoot, asarRoot, vendor, asarVendor, unpackedRoot, unpackedVendor].filter(
  (dir, idx, arr) => dir && arr.indexOf(dir) === idx && fs.existsSync(path.join(dir, "node_modules")),
);

if (fallbackRoots.length > 0) {
  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function patchedResolveFilename(request, parent, isMain, options) {
    try {
      return originalResolveFilename.call(this, request, parent, isMain, options);
    } catch (error) {
      if (error?.code !== "MODULE_NOT_FOUND") throw error;
      if (
        typeof request !== "string" ||
        request.startsWith(".") ||
        request.startsWith("/") ||
        path.isAbsolute(request)
      ) {
        throw error;
      }
      // Already in a fallback-roots attempt — do not recurse.
      if (options && Array.isArray(options.paths) && fallbackRoots.some((r) => options.paths.includes(r))) {
        throw error;
      }
      try {
        return originalResolveFilename.call(this, request, null, false, { paths: fallbackRoots });
      } catch {
        throw error;
      }
    }
  };
}

try {
  const { installHotPatchResolveHook } = require("./hot-patch-loader.cjs");
  installHotPatchResolveHook();
} catch {
  /* ignore */
}

// Enforce windowsHide: true across child_process and patch chrome-headless-shell.exe to IMAGE_SUBSYSTEM_WINDOWS_GUI (2)
if (process.platform === "win32" && process.env.FORCE_VISIBLE_CONSOLE !== "1") {
  try {
    const cp = require("node:child_process");
    if (!cp.__windowsHideGuardInstalled) {
      if (cp.ChildProcess && cp.ChildProcess.prototype && typeof cp.ChildProcess.prototype.spawn === "function") {
        const origProtoSpawn = cp.ChildProcess.prototype.spawn;
        cp.ChildProcess.prototype.spawn = function safeProtoSpawn(options) {
          if (options && typeof options === "object") {
            options.windowsHide = true;
          }
          return origProtoSpawn.call(this, options);
        };
      }
      const withSyncHide = (origFn) =>
        function safeSyncSpawn(file, args, options) {
          if (Array.isArray(args)) {
            const nextOpts =
              options && typeof options === "object" ? { ...options, windowsHide: true } : { windowsHide: true };
            return origFn.call(this, file, args, nextOpts);
          }
          if (args && typeof args === "object") {
            return origFn.call(this, file, { ...args, windowsHide: true });
          }
          return origFn.call(this, file, { windowsHide: true });
        };
      if (typeof cp.spawnSync === "function") cp.spawnSync = withSyncHide(cp.spawnSync);
      if (typeof cp.execFileSync === "function") cp.execFileSync = withSyncHide(cp.execFileSync);
      if (typeof cp.execSync === "function") {
        const origExecSync = cp.execSync;
        cp.execSync = function safeExecSync(command, options) {
          const nextOpts =
            options && typeof options === "object" ? { ...options, windowsHide: true } : { windowsHide: true };
          return origExecSync.call(this, command, nextOpts);
        };
      }
      cp.__windowsHideGuardInstalled = true;
      if (typeof Module.syncBuiltinESMExports === "function") {
        Module.syncBuiltinESMExports();
      }
    }

    const os = require("node:os");
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const msPlaywright = path.join(localAppData, "ms-playwright");
    if (fs.existsSync(msPlaywright)) {
      for (const entry of fs.readdirSync(msPlaywright, { withFileTypes: true })) {
        if (!entry.isDirectory() || !entry.name.startsWith("chromium_headless_shell-")) continue;
        for (const sub of ["chrome-headless-shell-win64", "chrome-win"]) {
          const exePath = path.join(msPlaywright, entry.name, sub, "chrome-headless-shell.exe");
          if (!fs.existsSync(exePath)) continue;
          try {
            const fd = fs.openSync(exePath, "r+");
            try {
              const dos = Buffer.alloc(64);
              fs.readSync(fd, dos, 0, 64, 0);
              if (dos.readUInt16LE(0) === 0x5a4d) {
                const peOffset = dos.readUInt32LE(60);
                const subOffset = peOffset + 24 + 68;
                const subBuf = Buffer.alloc(2);
                fs.readSync(fd, subBuf, 0, 2, subOffset);
                if (subBuf.readUInt16LE(0) === 3) {
                  subBuf.writeUInt16LE(2, 0);
                  fs.writeSync(fd, subBuf, 0, 2, subOffset);
                }
              }
            } finally {
              fs.closeSync(fd);
            }
          } catch {
            /* ignore if locked */
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
}

module.exports.packagedNodeModulesPath = vendor;
