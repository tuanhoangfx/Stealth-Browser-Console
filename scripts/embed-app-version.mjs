/**
 * App version embed for header clock (meta + VITE_APP_VERSION + VITE_APP_BUILT_AT).
 * Vendored from Tool/scripts/embed-app-version.mjs — Electron/desktop bake must not
 * static-import ../scripts outside the product root.
 *
 * Must define VITE_APP_VERSION + VITE_APP_BUILT_AT (header clock SSOT).
 * CLI: node scripts/embed-app-version.mjs [--product-root PATH]
 * Vite: import { hubAppVersionPlugin } from "./scripts/embed-app-version.mjs"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function readPkgVersion(productRoot) {
  const pkgPath = path.join(productRoot, "package.json");
  if (!fs.existsSync(pkgPath)) return "";
  return String(JSON.parse(fs.readFileSync(pkgPath, "utf8")).version || "").trim();
}

function injectAppVersionMeta(html, version) {
  const metaTag = `<meta name="app-version" content="${version}" />`;
  const metaRe = /<meta\s+name=["']app-version["']\s+content=["'][^"']*["']\s*\/?>/i;
  if (metaRe.test(html)) return html.replace(metaRe, metaTag);
  if (/<meta\s+name=["']viewport["']/i.test(html)) {
    return html.replace(/<meta\s+name=["']viewport["']/i, `${metaTag}\n    <meta name="viewport"`);
  }
  if (/<head>/i.test(html)) return html.replace(/<head>/i, `<head>\n    ${metaTag}`);
  return html;
}

/** Vite plugin — injects meta at build time (Git/Release safe, no source dirty). */
export function hubAppVersionPlugin(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  let version = "";

  return {
    name: "hub-app-version",
    config() {
      version = readPkgVersion(root);
      const builtAtIso = String(process.env.VITE_APP_BUILT_AT || new Date().toISOString());
      return {
        define: {
          ...(version ? { "import.meta.env.VITE_APP_VERSION": JSON.stringify(version) } : {}),
          "import.meta.env.VITE_APP_BUILT_AT": JSON.stringify(builtAtIso),
        },
      };
    },
    transformIndexHtml(html) {
      if (!version) version = readPkgVersion(root);
      if (!version) return html;
      return injectAppVersionMeta(html, version);
    },
  };
}

function parseArgs(argv) {
  let productRoot = process.cwd();
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--product-root" && argv[i + 1]) productRoot = path.resolve(argv[++i]);
  }
  return { productRoot };
}

function runCli() {
  const { productRoot } = parseArgs(process.argv);
  const htmlPath = path.join(productRoot, "index.html");
  const version = readPkgVersion(productRoot);

  if (!version) {
    console.error("embed-app-version: package.json version missing");
    process.exit(1);
  }
  if (!fs.existsSync(htmlPath)) {
    console.error(`embed-app-version: missing ${htmlPath}`);
    process.exit(1);
  }

  const html = fs.readFileSync(htmlPath, "utf8");
  fs.writeFileSync(htmlPath, injectAppVersionMeta(html, version));
  console.log(`embed-app-version: ok v${version}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) runCli();
