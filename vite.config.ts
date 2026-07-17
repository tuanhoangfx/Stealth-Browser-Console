import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { hubUiVendorWatchPlugin } from "../scripts/hub-ui-vendor-watch-vite-plugin.mjs";

const rootDir = path.resolve(__dirname);
const hubUiSrc = path.resolve(rootDir, "vendor/hub-ui/src");
const hubIdentitySrc = path.resolve(rootDir, "vendor/hub-identity/src");
const devRoot = path.resolve(rootDir, "../..");

export default defineConfig({
  base: "./",
  plugins: [react(), hubUiVendorWatchPlugin({ toolRoot: rootDir, devRoot, code: "P0003" })],
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
        manualChunks(id) {
          if (id.includes("node_modules/dagre") || id.includes("node_modules/@xyflow")) {
            return "workflow-editor";
          }
        },
      },
    },
  },
});
