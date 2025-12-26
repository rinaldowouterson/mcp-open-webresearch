import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [".test/infrastructure/**/*.infra.test.ts"],
    // We do NOT exclude infra.test.ts here
    globals: true,
    testTimeout: 0 // Disable global timeout, rely on activity timeouts in test
  },
});
