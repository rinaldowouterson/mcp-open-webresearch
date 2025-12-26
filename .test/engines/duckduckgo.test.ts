import { test, expect, vi } from "vitest";
import { searchDuckDuckGo } from "../../src/engines/duckduckgo";

// Mock the config loader
vi.mock("../../src/config/index", () => ({
  loadConfig: vi.fn().mockReturnValue({
    proxy: {
      enabled: false,
      isValid: false,
      url: "",
      error: null,
      agent: null
    }
  })
}));

test("DuckDuckGo refactored search returns results", async () => {
  const query = "python tutorial technology trends 2025 AI";
  console.log(`Testing DuckDuckGo refactored search with query: "${query}"`);

  try {
    const results = await searchDuckDuckGo(query, 5);
    console.log(`✅ DuckDuckGo refactored returned ${results.length} results`);

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
      expect(result.engine).toEqual("duckduckgo");
    });

    console.log("✅ All DuckDuckGo refactored tests passed!");
  } catch (error) {
    console.error("❌ DuckDuckGo refactored test failed:", error);
    throw error;
  }
}, 30000);
