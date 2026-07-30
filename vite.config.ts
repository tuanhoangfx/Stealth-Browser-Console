import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = path.resolve(__dirname);
const hubUiSrc = path.resolve(rootDir, "vendor/hub-ui/src");
const hubIdentitySrc = path.resolve(rootDir, "vendor/hub-identity/src");
const devRoot = path.resolve(rootDir, "../..");

export default defineConfig(async () => {
  const plugins = [react()];

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

  return {
    base: "./",
    plugins,
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: [
        { find: /^@tool-workspace\/hub-ui\/(.+)$/, replacement: `${hubUiSrc}/$1` },
        { find: "@tool-workspace/hub-ui", replacement: path.join(hubUiSrc, "index.ts") },
        { find: /^@tool-workspace\/hub-identity\/(.+)$/, replacement: `${hubIdentitySrc}/$1` },
        { find: "@tool-workspace/hub-identity", replacement: path.join(hubIdentitySrc, "index.ts") },
        { find: /^@dev\/hub-identity\/(.+)$/, replacement: `${hubIdentitySrc}/$1` },
        { find: "@dev/hub-identity", replacement: path.join(hubIdentitySrc, "index.ts") }
      ]
    },
    server: {
      port: 5175,
      strictPort: true,
      // Packaging writes under dist-desktop/ while Electron/Vite are up — ignore so
      // license/html changes do not force full client reloads / stack churn.
      watch: {
        ignored: ["**/dist-desktop/**", "**/dist/**", "**/.tmp-asar-check/**"],
      },
      fs: {
        allow: [rootDir, hubUiSrc, hubIdentitySrc, path.resolve(rootDir, "../packages"), devRoot]
      }
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes("node_modules/dagre") || id.includes("node_modules/@xyflow")) {
              return "workflow-editor";
            }
          },
        },
      },
    },
  };
});
