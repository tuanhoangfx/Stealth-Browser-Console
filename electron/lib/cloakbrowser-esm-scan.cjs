"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { CLOAK_ESM_DEPS } = require("./cloakbrowser-esm-deps.cjs");

/** Files whose bare ESM imports must resolve beside unpacked cloakbrowser (profile launch). */
const CRITICAL_CLOAK_ESM_FILES = ["download.js", "geoip.js"];

/** Unpacked by electron-builder asarUnpack — not copied via CLOAK_ESM_DEPS / afterPack. */
const ASAR_UNPACKED_SIBLING_PACKAGES = new Set(["playwright-core", "better-sqlite3", "sql.js"]);

const NODE_BUILTIN_PACKAGES = new Set([
  ...require("node:module").builtinModules,
  ...require("node:module").builtinModules.map((name) => `node:${name}`),
]);

const IMPORT_PATTERNS = [
  /from\s+["']([^"']+)["']/g,
  /import\s*\(\s*["']([^"']+)["']\s*\)/g,
  /import\s+["']([^"']+)["']/g,
];

const STATIC_IMPORT_PATTERNS = [/from\s+["']([^"']+)["']/g, /import\s+["']([^"']+)["']/g];
const DYNAMIC_IMPORT_PATTERNS = [/import\s*\(\s*["']([^"']+)["']\s*\)/g];

/** Dynamic imports that cloakbrowser treats as optional (try/catch) — not gated. */
const OPTIONAL_DYNAMIC_IMPORTS = new Set(["socks-proxy-agent"]);

function packageNameFromSpecifier(specifier) {
  if (!specifier || specifier.startsWith(".") || specifier.startsWith("node:")) return null;
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }
  return specifier.split("/")[0];
}

function listJsFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listJsFiles(full, out);
    else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) out.push(full);
  }
  return out;
}

function collectSpecifiersFromText(text, patterns) {
  /** @type {Set<string>} */
  const names = new Set();
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) {
      const pkg = packageNameFromSpecifier(match[1]);
      if (pkg) names.add(pkg);
    }
  }
  return names;
}

function scanBareImportsFromFile(filePath, { criticalOnly = false } = {}) {
  const text = fs.readFileSync(filePath, "utf8");
  if (!criticalOnly) {
    return collectSpecifiersFromText(text, IMPORT_PATTERNS);
  }
  const names = collectSpecifiersFromText(text, STATIC_IMPORT_PATTERNS);
  const dynamic = collectSpecifiersFromText(text, DYNAMIC_IMPORT_PATTERNS);
  for (const pkg of dynamic) {
    if (!OPTIONAL_DYNAMIC_IMPORTS.has(pkg)) names.add(pkg);
  }
  return names;
}

function scanBareImportsFromDir(distDir, { onlyFiles, criticalOnly = false } = {}) {
  /** @type {Set<string>} */
  const names = new Set();
  if (onlyFiles?.length) {
    for (const rel of onlyFiles) {
      const full = path.join(distDir, rel);
      if (!fs.existsSync(full)) continue;
      for (const pkg of scanBareImportsFromFile(full, { criticalOnly })) names.add(pkg);
    }
    return names;
  }
  for (const file of listJsFiles(distDir)) {
    for (const pkg of scanBareImportsFromFile(file, { criticalOnly })) names.add(pkg);
  }
  return names;
}

function cloakbrowserPackageDir(projectRoot) {
  return path.dirname(cloakbrowserDistDir(projectRoot));
}

function filterPackagedEsmImports(imports) {
  return [...imports].filter((name) => {
    if (name === "cloakbrowser") return false;
    if (NODE_BUILTIN_PACKAGES.has(name)) return false;
    if (ASAR_UNPACKED_SIBLING_PACKAGES.has(name)) return false;
    return true;
  });
}

function resolveSearchPaths(projectRoot, fromDir) {
  return [
    fromDir,
    projectRoot,
    path.join(projectRoot, "node_modules"),
    path.join(projectRoot, "node_modules", ".pnpm", "node_modules"),
  ].filter((p) => p && fs.existsSync(p));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function resolvePackageRoot(projectRoot, name, fromDir) {
  const require = createRequire(path.join(projectRoot, "package.json"));
  const searchPaths = resolveSearchPaths(projectRoot, fromDir);
  try {
    const entry = require.resolve(`${name}/package.json`, { paths: searchPaths });
    return path.dirname(entry);
  } catch (error) {
    let resolved;
    try {
      resolved = require.resolve(name, { paths: searchPaths });
    } catch {
      const pnpm = path.join(projectRoot, "node_modules", ".pnpm");
      if (fs.existsSync(pnpm)) {
        const needle = path.join(...String(name).split("/"));
        for (const entry of fs.readdirSync(pnpm, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const candidate = path.join(pnpm, entry.name, "node_modules", needle);
          if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
        }
      }
      throw error;
    }
    let dir = path.dirname(resolved);
    while (dir && dir !== path.dirname(dir)) {
      const pkgFile = path.join(dir, "package.json");
      if (fs.existsSync(pkgFile)) {
        try {
          const pkg = readJson(pkgFile);
          if (pkg.name === name || dir.endsWith(`${path.sep}${name}`) || dir.endsWith(`/${name}`)) {
            return dir;
          }
        } catch {
          /* continue */
        }
      }
      dir = path.dirname(dir);
    }
    throw error;
  }
}

function collectTransitiveDeps(projectRoot, seedNames, { fromDir } = {}) {
  /** @type {Map<string, string>} */
  const resolved = new Map();
  const baseDir = fromDir || projectRoot;
  /** @type {Array<{ name: string, fromDir: string }>} */
  const pending = seedNames.map((name) => ({ name, fromDir: baseDir }));

  while (pending.length) {
    const item = pending.shift();
    if (!item || resolved.has(item.name)) continue;

    let src;
    try {
      src = resolvePackageRoot(projectRoot, item.name, item.fromDir);
    } catch (error) {
      throw new Error(
        `collectTransitiveDeps: cannot resolve "${item.name}" from ${item.fromDir} — ${error instanceof Error ? error.message : error}`,
      );
    }
    resolved.set(item.name, src);

    const pkg = readJson(path.join(src, "package.json"));
    for (const dep of Object.keys(pkg.dependencies || {})) {
      if (!resolved.has(dep)) pending.push({ name: dep, fromDir: src });
    }
  }

  return resolved;
}

function cloakbrowserDistDir(projectRoot) {
  /** @type {string[]} */
  const candidates = [path.join(projectRoot, "node_modules", "cloakbrowser", "dist")];
  const pnpm = path.join(projectRoot, "node_modules", ".pnpm");
  if (fs.existsSync(pnpm)) {
    for (const entry of fs.readdirSync(pnpm, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith("cloakbrowser@")) continue;
      candidates.push(path.join(pnpm, entry.name, "node_modules", "cloakbrowser", "dist"));
    }
  }
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.js"))) return dir;
  }
  throw new Error("cloakbrowser dist not found — run pnpm install");
}

function verifyCloakEsmDeps(projectRoot) {
  const distDir = cloakbrowserDistDir(projectRoot);
  const allRaw = scanBareImportsFromDir(distDir);
  const criticalRaw = scanBareImportsFromDir(distDir, {
    onlyFiles: CRITICAL_CLOAK_ESM_FILES,
    criticalOnly: true,
  });
  const directImports = filterPackagedEsmImports(allRaw);
  const criticalImports = filterPackagedEsmImports(criticalRaw);
  const seedSet = new Set(CLOAK_ESM_DEPS);
  const cloakRoot = cloakbrowserPackageDir(projectRoot);

  /** @type {string[]} */
  const missingDirectSeeds = [];
  for (const name of criticalImports) {
    if (!seedSet.has(name)) missingDirectSeeds.push(name);
  }

  const requiredTransitive = collectTransitiveDeps(projectRoot, criticalImports, { fromDir: cloakRoot });
  const seedTransitive = collectTransitiveDeps(projectRoot, CLOAK_ESM_DEPS, { fromDir: projectRoot });

  /** @type {string[]} */
  const missingTransitive = [];
  for (const name of requiredTransitive.keys()) {
    if (!seedTransitive.has(name)) missingTransitive.push(name);
  }

  /** @type {string[]} */
  const unusedSeeds = [];
  for (const name of CLOAK_ESM_DEPS) {
    if (!requiredTransitive.has(name)) unusedSeeds.push(name);
  }

  const informational = directImports.filter((name) => !criticalImports.includes(name));

  const ok = missingDirectSeeds.length === 0 && missingTransitive.length === 0;

  return {
    ok,
    distDir,
    criticalFiles: CRITICAL_CLOAK_ESM_FILES,
    directImports: directImports.sort(),
    criticalImports: criticalImports.sort(),
    informationalImports: informational.sort(),
    missingDirectSeeds: missingDirectSeeds.sort(),
    missingTransitive: missingTransitive.sort(),
    unusedSeeds: unusedSeeds.sort(),
    requiredTransitive: [...requiredTransitive.keys()].sort(),
    seedTransitive: [...seedTransitive.keys()].sort(),
  };
}

module.exports = {
  CLOAK_ESM_DEPS,
  CRITICAL_CLOAK_ESM_FILES,
  ASAR_UNPACKED_SIBLING_PACKAGES,
  packageNameFromSpecifier,
  scanBareImportsFromFile,
  scanBareImportsFromDir,
  filterPackagedEsmImports,
  collectTransitiveDeps,
  cloakbrowserDistDir,
  verifyCloakEsmDeps,
};
