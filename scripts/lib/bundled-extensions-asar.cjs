"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { shouldCopyExtensionEntry } = require("../../electron/lib/cloakbrowser-extension-stage.cjs");

function copyCleanExtensionTree(srcRoot, destRoot, relBase = "") {
  fs.mkdirSync(destRoot, { recursive: true });
  for (const entry of fs.readdirSync(srcRoot, { withFileTypes: true })) {
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    // Top-level entries under build/bundled-extensions are `<extOrStoreId>/<variant>/...`
    // Apply extension non-runtime filtering from level 3 onward (`<id>/<variant>/<rel>`),
    // or directly if `dist/*-store` / `.chrome-store-profile` / `.git` appears anywhere.
    const normalized = rel.replace(/\\/g, "/");
    const subRel = normalized.split("/").slice(2).join("/");
    if (subRel && !shouldCopyExtensionEntry(subRel)) continue;
    if (/\/(?:\.chrome-store-profile|node_modules|\.git|\.cursor|\.github|\.vscode|coverage|\.turbo)(?:\/|$)/i.test(`/${normalized}`)) {
      continue;
    }
    const from = path.join(srcRoot, entry.name);
    const to = path.join(destRoot, entry.name);
    if (entry.isDirectory()) copyCleanExtensionTree(from, to, rel);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

/**
 * Pack `build/bundled-extensions/` (stripped of non-runtime dev/cache trees)
 * into a single `build/bundled-extensions.asar` archive for fast NSIS install/uninstall.
 */
async function packBundledExtensionsAsar(repoRoot, options = {}) {
  const srcDir = options.srcDir || path.join(repoRoot, "build", "bundled-extensions");
  const outAsar = options.outAsar || path.join(repoRoot, "build", "bundled-extensions.asar");
  if (!fs.existsSync(srcDir)) {
    return { ok: false, reason: "missing_src_dir", outAsar };
  }
  const { createPackage } = require("@electron/asar");
  const tmpStage = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-ext-asar-"));
  const tmpOut = path.join(os.tmpdir(), `p0003-ext-${Date.now()}.asar`);
  try {
    copyCleanExtensionTree(srcDir, tmpStage);
    await createPackage(tmpStage, tmpOut);
    if (!fs.existsSync(tmpOut) || fs.statSync(tmpOut).size < 1024) {
      throw new Error(`packed asar is empty: ${tmpOut}`);
    }
    fs.mkdirSync(path.dirname(outAsar), { recursive: true });
    const tmpTarget = `${outAsar}.tmp`;
    fs.copyFileSync(tmpOut, tmpTarget);
    fs.renameSync(tmpTarget, outAsar);
    const sizeBytes = fs.statSync(outAsar).size;
    return { ok: true, outAsar, sizeBytes };
  } finally {
    try {
      fs.rmSync(tmpStage, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    try {
      if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    } catch {
      /* ignore */
    }
  }
}

module.exports = { packBundledExtensionsAsar };
