import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = path.resolve(__dirname);
const hubUiSrc = path.resolve(rootDir, "vendor/hub-ui/src");
const hubIdentitySrc = path.resolve(rootDir, "vendor/hub-identity/src");
const devRoot = path.resolve(rootDir, "../..");

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
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
          if (id.includes("node_modules/dagre")) {
            return "dagre";
          }
          if (
            id.includes("node_modules/@xyflow") ||
            id.includes("ScriptsEditorPane") ||
            id.includes("WorkflowScriptFlow")
          ) {
            return "workflow-editor";
          }
        },
      },
    },
  },
});
