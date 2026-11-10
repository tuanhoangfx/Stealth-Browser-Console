import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error shared embed (JS module) — VITE_APP_VERSION + VITE_APP_BUILT_AT
import { hubAppVersionPlugin } from "./scripts/embed-app-version.mjs";
import { createHubManualChunks, HUB_CHUNK_SIZE_WARNING_LIMIT_KB } from "../scripts/vite-hub-chunks.mjs";

const rootDir = path.resolve(__dirname);
const hubUiSrc = path.resolve(rootDir, "../../packages/hub-ui/src");
const hubIdentitySrc = path.resolve(rootDir, "../../packages/hub-identity/src");
const devRoot = path.resolve(rootDir, "../..");

export default defineConfig(async ({ command }) => {
  const plugins = [
    hubAppVersionPlugin({ root: rootDir }),
    react(),
    {
      name: "electron-file-protocol-html",
      apply: "build" as const,
      enforce: "post" as const,
      transformIndexHtml: {
        order: "post" as const,
        handler(html: string) {
          // file:// + Vite `crossorigin` breaks Chromium Force Reload (Shift+F5).
          return html.replace(/\s+crossorigin(?:="[^"]*")?/gi, "");
        },
      },
    },
  ];

  // Dev-only plugin: avoid static import of a file outside tool root, so
  // Vercel standalone build does not fail module resolution.
  const pluginPath = path.resolve(rootDir, "../scripts/hub-ui-vendor-watch-vite-plugin.mjs");
  if (fs.existsSync(pluginPath)) {
    try {
      const mod = await import(pathToFileURL(pluginPath).href);
      if (typeof mod?.hubUiVendorWatchPlugin === "function") {
        plugins.push(mod.hubUiVendorWatchPlugin({ toolRoot: rootDir, devRoot, code: "P0003" }));
      }
    } catch {
      // Non-fatal: serve mode will just skip auto vendor sync if plugin cannot load.
    }
  }

  // Dev `/api/hub/auth/*` (User ID → auth email). Same monorepo-only guard as above.
  const authApiPluginPath = path.resolve(rootDir, "../scripts/lib/hub-auth-dev-api-vite-plugin.mjs");
  if (fs.existsSync(authApiPluginPath)) {
    try {
      const mod = await import(pathToFileURL(authApiPluginPath).href);
      if (typeof mod?.hubAuthDevApiPlugin === "function") {
        plugins.push(mod.hubAuthDevApiPlugin({ toolRoot: rootDir, devRoot, code: "P0003" }));
      }
    } catch {
      // Non-fatal: sign-in falls back to the synthetic email path.
    }
  }

  return {
    // Serve: absolute base so `/profiles` hard-refresh works. Build: `./` for Electron file://.
    base: command === "serve" ? "/" : "./",
    appType: "spa" as const,
    plugins,
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: [
        { find: /^@tool-workspace\/hub-ui\/(.+)$/, replacement: `${hubUiSrc}/$1` },
        { find: "@tool-workspace/hub-ui", replacement: path.join(hubUiSrc, "index.ts") },
        { find: /^@tool-workspace\/hub-identity\/(.+)$/, replacement: `${hubIdentitySrc}/$1` },
        { find: "@tool-workspace/hub-identity", replacement: path.join(hubIdentitySrc, "index.ts") }
      ]
    },
    server: {
      port: 5175,
      strictPort: true,
      // Packaging writes under dist-desktop/ while Electron/Vite are up — ignore so
      // license/html changes do not force full client reloads / stack churn.
      watch: {
        ignored: (p: string) => {
          const norm = p.replace(/\\/g, "/");
          if (
            norm.includes("/node_modules/") ||
            norm.includes("/dist-desktop/") ||
            norm.includes("/dist/") ||
            norm.includes("/.tmp-asar-check/") ||
            norm.includes("/data/") ||
            norm.includes("/.cache/") ||
            norm.includes("/logs/") ||
            norm.includes("/.ship/") ||
            norm.includes("/.git/") ||
            norm.includes("/.runtime/") ||
            norm.includes("/build/bundled-extensions/") ||
            norm.endsWith("/tool.manifest.json") ||
            norm.endsWith("/CHANGELOG.md") ||
            norm.endsWith("/.vite-active-lease.txt") ||
            norm.endsWith(".log") ||
            norm.endsWith(".pid") ||
            norm.endsWith(".state.json") ||
            norm.endsWith(".env.json")
          ) {
            return true;
          }
          if (
            norm.includes("/Tool/") &&
            !norm.includes("/Tool/P0003-Stealth-Browser-Console")
          ) {
            return true;
          }
          return false;
        },
      },
      fs: {
        allow: [rootDir, hubUiSrc, hubIdentitySrc, path.resolve(rootDir, "../packages"), devRoot]
      }
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      chunkSizeWarningLimit: HUB_CHUNK_SIZE_WARNING_LIMIT_KB,
      rollupOptions: {
        output: {
          manualChunks: createHubManualChunks({
            "vendor-workflow": (id: string) =>
              id.includes("node_modules/dagre") || id.includes("node_modules/@xyflow"),
          }),
        },
      },
    },
    test: {
      maxWorkers: 3,
    },
  };
});
