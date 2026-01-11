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
      ".test/engines/*_unit.test.ts",
      ".test/engines/bing_url_resolution.test.ts",
      ".test/engines/throttle.test.ts",
      ".test/utils/**/*.test.ts",
      ".test/isValidUrl.test.ts",
      ".test/server/helpers/executeMultiEngineSearch.test.ts",
      ".test/server/helpers/deepSearch/**/*.test.ts",
      // Integration tests using local mock servers (mockttp, http.Server)
      ".test/engines/smart_fetch_mode.test.ts",
      ".test/engines/playwright_visit_e2e.test.ts",
      ".test/engines/fetch_client_e2e.test.ts",
    ],
    exclude: ["**/*.infra.test.ts", "node_modules", "build"],
    globals: true,
  },
});
