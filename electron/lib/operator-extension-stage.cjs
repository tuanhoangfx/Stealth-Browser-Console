const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { unpackedExtensionId } = require("./profile-chrome-preferences.cjs");
const { ensureCloakbrowserExtensionStages } = require("./cloakbrowser-extension-stage.cjs");

function cloakbrowserRoot() {
  const override = String(process.env.STEALTH_CLOAKBROWSER_ROOT || "").trim();
  if (override) return path.resolve(override);
  return path.join(os.homedir(), ".cloakbrowser");
}

function operatorContract() {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "..", "shared", "operator-cdp.json"), "utf8"),
    );
  } catch {
    return { stageDirName: "extension-stage" };
  }
}

/** Stable copy outside `chromium-<version>/`, so an engine bump does not drop the manifest. */
function operatorStableRoot() {
  const name = String(operatorContract().stageDirName || "extension-stage").trim() || "extension-stage";
  return path.join(cloakbrowserRoot(), name);
}

function listChromiumCacheDirs() {
  const root = cloakbrowserRoot();
  if (!fs.existsSync(root)) return [];
  const dirs = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith("chromium-")) continue;
    dirs.push(path.join(root, entry.name));
  }
  return dirs;
}

function samePath(a, b) {
  return path.resolve(String(a || "")).replace(/\\/g, "/").toLowerCase() ===
    path.resolve(String(b || "")).replace(/\\/g, "/").toLowerCase();
}

function ensureStageJunction(stageDir, linkPath) {
  const target = path.resolve(stageDir);
  try {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      const current = fs.readlinkSync(linkPath);
      if (samePath(current, target)) return "ok";
      fs.rmSync(linkPath, { recursive: true, force: true });
    } else {
      fs.rmSync(linkPath, { recursive: true, force: true });
    }
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      if (fs.existsSync(path.join(linkPath, "manifest.json"))) return "locked-copy";
      return "skip";
    }
  }
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(target, linkPath, "junction");
  return "linked";
}

/**
 * Collect runtime entry points declared in an extension's `manifest.json`.
 */
function collectOperatorManifestEntryPoints(dir) {
  const out = new Set();
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest?.background?.service_worker) out.add(String(manifest.background.service_worker));
    if (manifest?.action?.default_popup) out.add(String(manifest.action.default_popup));
    if (manifest?.options_page) out.add(String(manifest.options_page));
    for (const cs of manifest?.content_scripts ?? []) {
      for (const js of cs?.js ?? []) out.add(String(js));
      for (const css of cs?.css ?? []) out.add(String(css));
    }
    for (const iconPath of Object.values(manifest?.icons ?? {})) {
      if (iconPath) out.add(String(iconPath));
    }
    if (manifest?.action?.default_icon && typeof manifest.action.default_icon === "object") {
      for (const iconPath of Object.values(manifest.action.default_icon)) {
        if (iconPath) out.add(String(iconPath));
      }
    }
  } catch {
    return [];
  }
  return [...out];
}

/**
 * Validate that an unpacked/staged extension directory contains all manifest entry points
 * and (if it is E0002 Browser Operator) matches the `shared/operator-cdp.json` contract.
 */
function validateOperatorExtensionPackage(dir, contractOverride = null) {
  const targetDir = path.resolve(String(dir || ""));
  const manifestPath = path.join(targetDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, files: [], missing: ["manifest.json"], contractErrors: ["manifest.json missing"] };
  }
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return { ok: false, files: [], missing: ["manifest.json"], contractErrors: ["invalid manifest.json"] };
  }

  const entries = collectOperatorManifestEntryPoints(targetDir);
  const files = ["manifest.json", ...entries].map((f) => f.replace(/\\/g, "/"));
  const missing = [];
  for (const rel of files) {
    const absFile = path.join(targetDir, rel);
    if (!fs.existsSync(absFile)) {
      missing.push(rel);
      continue;
    }
    try {
      if (fs.statSync(absFile).size === 0) {
        missing.push(rel);
      }
    } catch {
      missing.push(rel);
    }
  }

  const contractErrors = [];
  const contract = contractOverride || operatorContract();
  const isE0002 =
    String(manifest?.name || "").includes("E0002") ||
    path.basename(targetDir).toLowerCase().includes("e0002");

  if (isE0002 && contract?.page) {
    const normalizeCs = (list) =>
      (list ?? []).map((cs) => ({
        matches: [...(cs.matches ?? [])],
        js: [...(cs.js ?? [])],
        run_at: cs.run_at || "document_idle",
        ...(cs.all_frames ? { all_frames: true } : {}),
      }));
    const mHosts = JSON.stringify(manifest.host_permissions ?? []);
    const cHosts = JSON.stringify(contract.page.hostPermissions ?? []);
    if (mHosts !== cHosts) {
      contractErrors.push(`host_permissions mismatch: ${mHosts} !== ${cHosts}`);
    }
    const mCs = JSON.stringify(normalizeCs(manifest.content_scripts));
    const cCs = JSON.stringify(normalizeCs(contract.page.contentScripts));
    if (mCs !== cCs) {
      contractErrors.push("content_scripts mismatch vs operator-cdp.json");
    }
  }

  return {
    ok: missing.length === 0 && contractErrors.length === 0,
    version: typeof manifest?.version === "string" ? manifest.version.trim() : null,
    files: [...new Set(files)].sort(),
    missing,
    contractErrors,
  };
}

const _operatorStageSyncCache = new Map();
const OPERATOR_STAGE_SYNC_TTL_MS = 30_000;

/**
 * Copy an extension into `.cloakbrowser/extension-stage/<id>` and junction that
 * folder into every `chromium-*` cache. Store ids (E0001) and unpacked ids (E0002)
 * both land here, so an engine bump does not drop the manifest.
 */
function syncOperatorChromiumStages(operatorDir, extraCacheDirs = [], options = {}) {
  const src = path.resolve(String(operatorDir || ""));
  const srcManifest = path.join(src, "manifest.json");
  if (!src || !fs.existsSync(srcManifest)) {
    return { extId: null, stageDir: null, linked: 0, validation: null };
  }
  const cacheKey = `${src}::${(extraCacheDirs || []).map((d) => String(d || "")).join("|")}`;
  const nowMs = Date.now();
  if (!options.force) {
    const cached = _operatorStageSyncCache.get(cacheKey);
    if (cached && nowMs - cached.at < OPERATOR_STAGE_SYNC_TTL_MS) {
      try {
        const curMtime = fs.statSync(srcManifest).mtimeMs;
        if (
          curMtime === cached.srcManifestMtime &&
          cached.result?.stageDir &&
          fs.existsSync(path.join(cached.result.stageDir, "manifest.json")) &&
          cached.linkedDirs.every((d) => fs.existsSync(path.join(d, cached.result.extId, "manifest.json")))
        ) {
          return cached.result;
        }
      } catch {
        /* fall through */
      }
    }
  }
  const staged = ensureCloakbrowserExtensionStages([src], operatorStableRoot(), options)[0];
  if (!staged?.stageDir) {
    return { extId: unpackedExtensionId(src), stageDir: null, linked: 0, validation: null };
  }
  const validation = validateOperatorExtensionPackage(staged.stageDir);

  const dirs = new Set(listChromiumCacheDirs().map((dir) => path.resolve(dir)));
  for (const extra of extraCacheDirs || []) {
    if (!extra) continue;
    dirs.add(path.resolve(String(extra)));
  }

  let linked = 0;
  const linkedDirs = [];
  for (const dir of dirs) {
    if (samePath(dir, operatorStableRoot()) || samePath(dir, staged.stageDir)) continue;
    const result = ensureStageJunction(staged.stageDir, path.join(dir, staged.extId));
    if (result === "ok" || result === "linked" || result === "locked-copy") {
      linked += 1;
      linkedDirs.push(dir);
    }
  }
  const out = { extId: staged.extId, stageDir: staged.stageDir, linked, validation };
  try {
    _operatorStageSyncCache.set(cacheKey, {
      at: nowMs,
      srcManifestMtime: fs.statSync(srcManifest).mtimeMs,
      linkedDirs,
      result: out,
    });
  } catch {
    /* ignore */
  }
  return out;
}

module.exports = {
  cloakbrowserRoot,
  operatorContract,
  operatorStableRoot,
  listChromiumCacheDirs,
  ensureStageJunction,
  collectOperatorManifestEntryPoints,
  validateOperatorExtensionPackage,
  syncOperatorChromiumStages,
};
