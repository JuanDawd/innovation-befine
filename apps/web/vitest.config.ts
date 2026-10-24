import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // tsconfig keeps JSX as-is for Next.js; tests need it compiled (component tests).
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "src/**/*.spec.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/e2e/**"],
    setupFiles: ["./src/test/setup.ts"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.spec.{ts,tsx}", "src/**/*.d.ts", "src/test/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
