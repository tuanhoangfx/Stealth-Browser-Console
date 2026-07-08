/**
 * electron-builder afterPack — place cloakbrowser ESM deps next to unpacked
 * cloakbrowser so `import "tar"` resolves (loadCloakbrowser uses unpacked entry).
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { CLOAK_ESM_DEPS } = require("./lib/cloakbrowser-esm-deps.cjs");

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

exports.default = async function afterPack(context) {
  const projectDir = context.packager.projectDir;
  const srcRoot = path.join(projectDir, "electron", "packaged-node_modules", "node_modules");
  const destRoot = path.join(context.appOutDir, "resources", "app.asar.unpacked", "node_modules");

  if (!fs.existsSync(srcRoot)) {
    console.warn("[afterPack] packed stage missing — skip cloak ESM deps");
    return;
  }

  let copied = 0;
  for (const name of CLOAK_ESM_DEPS) {
    const src = path.join(srcRoot, ...name.split("/"));
    if (!fs.existsSync(src)) {
      console.warn(`[afterPack] missing staged dep ${name}`);
      continue;
    }
    const dest = path.join(destRoot, ...name.split("/"));
    fs.rmSync(dest, { recursive: true, force: true });
    copyDir(src, dest);
    copied += 1;
  }
  console.log(`[afterPack] cloak ESM deps → app.asar.unpacked/node_modules (${copied}/${CLOAK_ESM_DEPS.length})`);
};
