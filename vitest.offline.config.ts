import { defineConfig } from "vitest/config";

/**
 * Offline test configuration.
 * Runs unit tests and integration tests that use LOCAL mock servers only.
 * Does NOT make any external network calls.
 * Use: npm run test:offline
 */
export default defineConfig({
  test: {
    include: [
      // Pure unit tests
      ".test/config/**/*.test.ts",

      ".test/utils/**/*.test.ts",
      ".test/isValidUrl.test.ts",
      ".test/domain/**/*.test.ts",
      ".test/infrastructure/**/*.test.ts",
      ".test/security/**/*.test.ts",
      // Integration tests using local mock servers (mockttp, http.Server)
    ],
    exclude: [
      "**/*.infra.test.ts",
      "node_modules",
      "build",
      "**/*search_e2e.test.ts",
    ],
    globals: true,
  },
});
