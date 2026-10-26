import { defineConfig } from "vitest/config";
import base from "./vitest.config";

/**
 * T135 — runs only the demo seed (src/test/demo-seed.seed.ts), never with the
 * test suite. `include` is replaced, not merged (mergeConfig concatenates arrays).
 */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["src/test/demo-seed.seed.ts"],
    environment: "node",
    testTimeout: 600_000,
    passWithNoTests: false,
  },
});
