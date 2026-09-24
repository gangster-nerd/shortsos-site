import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  // Components are plain functions a test can call; Next compiles JSX for the app itself.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
