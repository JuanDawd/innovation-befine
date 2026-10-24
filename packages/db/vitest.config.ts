import { defineConfig } from "vitest/config";

const withDb = Boolean(process.env.TEST_DATABASE_URL);

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // M-70b: integration tests TRUNCATE inside a rolled-back transaction, which
    // locks tables — run files one at a time when a test database is configured.
    fileParallelism: !withDb,
    testTimeout: withDb ? 30_000 : 5_000,
    coverage: {
      provider: "v8",
      include: ["src/queries/**/*.ts"],
      exclude: ["src/queries/**/__tests__/**", "src/queries/**/*.test.ts"],
      // CLAUDE.md: 80 % for financial queries. Enforced by `test:coverage`, which
      // needs the integration database (CI job "DB integration tests").
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
