/**
 * Search Engine E2E Tests
 * 
 * These tests make real network requests to verify engine functionality.
 * Run separately with: npx vitest run .test/engines/search_e2e.test.ts
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { getEngines } from "../../src/engines/search/registry.js";
import type { SearchEngine } from "../../src/types/search.js";

// Mock config to disable proxy for clean tests
vi.mock("../../src/config/index", () => ({
  loadConfig: vi.fn().mockReturnValue({
    proxy: {
      enabled: false,
      isValid: false,
      url: "",
      error: null,
      agent: null,
    },
    ssl: {
      ignoreTlsErrors: false,
    },
  }),
}));

describe("Search Engines E2E", () => {
  let engines: Map<string, SearchEngine>;

  beforeAll(async () => {
    engines = await getEngines();
  });

  // Dynamically create tests for each discovered engine
  it.each([
    ["bing"],
    ["brave"],
    ["duckduckgo"],
  ])("%s returns valid search results", async (engineName) => {
    const engine = engines.get(engineName);
    if (!engine) {
      console.warn(`Engine ${engineName} not found, skipping`);
      return;
    }

    const query = "test query";
    const results = await engine.search(query, 3);

    console.log(`${engineName}: ${results.length} results`);

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);

    // Allow "no results" as valid response
    if (results.length > 0 && results[0].title !== "No results found") {
      expect(results[0]).toHaveProperty("title");
      expect(results[0]).toHaveProperty("url");
      expect(results[0].engine).toBe(engineName);

      // URL should be valid
      if (results[0].url) {
        expect(results[0].url).toMatch(/^https?:\/\//);
      }
    }
  }, 30000); // 30s timeout for network requests
});
