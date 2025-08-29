import { test, expect, vi, beforeEach } from "vitest";
import { searchBing } from "../../src/engines/bing";
import { loadConfig } from "../../src/config/loader";

// Mock the config loader
vi.mock("../../src/config/loader", () => ({
  loadConfig: vi.fn().mockReturnValue({
    proxy: {
      enabled: false,
      isValid: false,
      url: "",
      error: null,
      agent: null,
    },
  }),
}));

test("Bing refactored search returns results", async () => {
  const query = "how to build a website";
  console.log(`Testing Bing refactored search with query: "${query}"`);

  try {
    const results = await searchBing(query, 5);
    console.log(`✅ Bing refactored returned ${results.length} results`);

    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(5);

    results.forEach((result, index) => {
      console.log(`Result ${index + 1}:`, {
        title: result.title,
        url: result.url,
        source: result.source,
        engine: result.engine,
      });

      expect(result).toHaveProperty("title");
      expect(result).toHaveProperty("url");
      expect(result.url).toMatch(/^https?:\/\//);
      expect(result.engine).toEqual("bing");
    });

    console.log("✅ All Bing refactored tests passed!");
  } catch (error) {
    console.error("❌ Bing refactored test failed:", error);
    throw error;
  }
}, 30000);
