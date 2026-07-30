import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default defineConfig(async () => {
  const resolvedViteConfig =
    typeof viteConfig === "function"
      ? await viteConfig({ command: "serve", mode: "test" })
      : viteConfig;

  return mergeConfig(
    resolvedViteConfig,
    defineConfig({
      test: {
        environment: "jsdom",
        globals: true,
        include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      },
    }),
  );
});
