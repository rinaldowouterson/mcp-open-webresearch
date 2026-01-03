import { describe, it, expect } from "vitest";
import {
  mergeSearchResults,
  getUrlHash,
} from "../../src/server/helpers/signalProcessor.js";
import { SearchResult } from "../../src/types/index.js";

describe("Signal Processor", () => {
  describe("getUrlHash", () => {
    it("should generate same hash for different protocol/www variants", () => {
      const h1 = getUrlHash("http://example.com");
      const h2 = getUrlHash("https://www.example.com/");
      const h3 = getUrlHash("https://example.com");

      expect(h1).toBe(h2);
      expect(h1).toBe(h3);
    });

    it("should be case-insensitive", () => {
      const h1 = getUrlHash("https://EXAMPLE.com/Path");
      const h2 = getUrlHash("https://example.com/path");
      expect(h1).toBe(h2);
    });
  });

  describe("mergeSearchResults", () => {
    it("should deduplicate results by URL hash", () => {
      const mockResults: SearchResult[] = [
        {
          title: "Title 1",
          url: "http://example.com",
          description: "Desc A",
          engine: "bing",
        },
        {
          title: "Title One",
          url: "https://www.example.com",
          description: "Desc B",
          engine: "brave",
        },
      ];

      const merged = mergeSearchResults(mockResults);

      expect(merged).toHaveLength(1);
      expect(merged[0].urlHash).toBe(getUrlHash("http://example.com"));
      expect(merged[0].engines).toContain("bing");
      expect(merged[0].engines).toContain("brave");
    });

    it("should implement Heuristic Champion (longest title/desc)", () => {
      const mockResults: SearchResult[] = [
        {
          title: "Short",
          url: "http://example.com",
          description: "This is a very long description that should be picked",
          engine: "bing",
        },
        {
          title: "A Much Longer Title",
          url: "http://example.com",
          description: "Short desc",
          engine: "brave",
        },
      ];

      const merged = mergeSearchResults(mockResults);

      expect(merged[0].title).toBe("A Much Longer Title");
      expect(merged[0].description).toBe(
        "This is a very long description that should be picked",
      );
    });

    it("should calculate consensus score: more engines = higher score", () => {
      // Result A: Rank 1 from Bing, Rank 1 from Brave (Multi-engine)
      // Result B: Rank 1 from DuckDuckGo (Single engine)
      const mockResults: SearchResult[] = [
        {
          title: "Result A",
          url: "http://A.com",
          description: "D",
          engine: "bing",
        },
        {
          title: "Result B",
          url: "http://B.com",
          description: "D",
          engine: "duckduckgo",
        },
        {
          title: "Result A",
          url: "http://A.com",
          description: "D",
          engine: "brave",
        },
      ];

      const merged = mergeSearchResults(mockResults);

      // Result A score: (1/1 + 1/3) * 2 = 1.33 * 2 = 2.66
      // Note: Ranks in the input list are 1-indexed based on their position in the flat array
      // Result A is at index 0 and 2 -> ranks 1 and 3
      // Result B is at index 1 -> rank 2
      // Let's verify exact indices:
      // A (0): rank 1
      // B (1): rank 2
      // A (2): rank 3

      const resA = merged.find((r) => r.title === "Result A")!;
      const resB = merged.find((r) => r.title === "Result B")!;

      // A score: (1/1 + 1/3) * 2 = 1.333 * 2 = 2.666
      // B score: (1/2) * 1 = 0.5

      expect(resA.consensusScore).toBeGreaterThan(resB.consensusScore);
      expect(merged[0].title).toBe("Result A");
    });

    it("should sort results by consensus score", () => {
      const mockResults: SearchResult[] = [
        {
          title: "Low",
          url: "http://low.com",
          description: "D",
          engine: "bing",
        },
        {
          title: "High",
          url: "http://high.com",
          description: "D",
          engine: "bing",
        },
        {
          title: "High",
          url: "http://high.com",
          description: "D",
          engine: "brave",
        },
      ];

      // Force "Low" to be first in input list but "High" should win sorting
      const merged = mergeSearchResults(mockResults);
      expect(merged[0].title).toBe("High");
    });
  });
});
