import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchBrave } from "../../src/engines/brave";

// Mock the config loader
vi.mock("../../src/config/index", () => ({
  loadConfig: vi.fn().mockReturnValue({
    proxy: {
      enabled: false,
      isValid: false,
      url: "",
      error: null,
      agent: null
    },
    ssl: {
      ignoreTlsErrors: false
    }
  })
}));

describe("Brave refactored search", () => {
  it("returns results", async () => {
    const query = "how to build a website";
    console.log(`Testing Brave refactored search with query: "${query}"`);

    const results = await searchBrave(query, 5);

    console.log(`Found ${results.length} results`);
    if (results.length > 0) {
      console.log("First result:", results[0]);
    }

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);

    if (results.length > 0 && results[0].title !== "No results found") {
      expect(results[0]).toHaveProperty("title");
      expect(results[0]).toHaveProperty("url");
      expect(results[0]).toHaveProperty("description");
      expect(results[0]).toHaveProperty("source");
      expect(results[0]).toHaveProperty("engine");
      expect(results[0].engine).toBe("brave");
    }
  });
});
