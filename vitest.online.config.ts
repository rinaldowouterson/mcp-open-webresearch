import { defineConfig } from "vitest/config";

/**
 * Online test configuration.
 * Runs tests that make REAL external network calls.
 * Use sparingly to avoid rate limiting/IP banning.
 * Use: npm run test:online
 */
export default defineConfig({
  test: {
    include: [
      // Tests that hit real search engines (Bing, Brave, DuckDuckGo)
      ".test/engines/all_engines.test.ts",
      ".test/engines/search_e2e.test.ts",
      // Proxy tests that route through real destinations (example.com)
      ".test/engines/proxy_e2e.test.ts",
      ".test/engines/docker_proxy_e2e.test.ts",
    ],
    exclude: ["node_modules", "build"],
    globals: true,
  },
});
