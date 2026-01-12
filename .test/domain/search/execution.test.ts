import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeMultiEngineSearch } from "../../../src/domain/search/execution.js";
import * as Registry from "../../../src/infrastructure/search/registry.js";
import * as Config from "../../../src/config/index.js";
import { SearchEngine } from "../../../src/types/search.js";
import { SearchResult } from "../../../src/types/index.js";
import { AppConfig } from "../../../src/types/app-config.js";

// Implement a Mock Engine Factory
const createMockEngine = (name: string, rateLimited = false): SearchEngine => ({
  name,
  search: vi
    .fn()
    .mockImplementation(
      async (query: string, limit: number): Promise<SearchResult[]> => {
        // Return 'limit' number of results
        return Array.from({ length: limit }, (_, i) => ({
          title: `${name} Result ${i + 1}`,
          url: `https://${name}.com/result/${i + 1}`,
          description: `Description for ${name} result ${i + 1}`,
          engine: name,
        }));
      },
    ),
  isRateLimited: () => rateLimited,
});

// Create minimal mock config
const createMockConfig = (skipCooldown: boolean): Partial<AppConfig> => ({
  skipCooldown,
  deepSearch: {
    maxLoops: 2,
    resultsPerEngine: 3,
    saturationThreshold: 0.5,
    maxCitationUrls: 10,
    reportRetentionMinutes: 60,
  },
});

describe("executeMultiEngineSearch", () => {
  let mockEngines: Map<string, SearchEngine>;

  beforeEach(() => {
    // Reset mocks
    vi.restoreAllMocks();

    // Setup mock engines
    mockEngines = new Map();
    mockEngines.set("mock1", createMockEngine("mock1"));
    mockEngines.set("mock2", createMockEngine("mock2"));

    // Mock the registry module
    vi.spyOn(Registry, "getEngines").mockResolvedValue(mockEngines);

    // Mock config with skipCooldown=false by default
    vi.spyOn(Config, "getConfig").mockReturnValue(
      createMockConfig(false) as AppConfig,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should request maxResults from EACH engine (not distributed)", async () => {
    const maxResults = 5;
    const requestedEngines = ["mock1", "mock2"];

    await executeMultiEngineSearch("test query", requestedEngines, maxResults);

    // Verify mock1 received limit=5
    const engine1 = mockEngines.get("mock1")!;
    expect(engine1.search).toHaveBeenCalledWith("test query", 5);

    // Verify mock2 received limit=5
    const engine2 = mockEngines.get("mock2")!;
    expect(engine2.search).toHaveBeenCalledWith("test query", 5);
  });

  it("should return additive results (more than maxResults total)", async () => {
    const maxResults = 5;
    const requestedEngines = ["mock1", "mock2"];

    // Each engine returns 5 unique results (total 10 unique URLs)
    const results = await executeMultiEngineSearch(
      "test query",
      requestedEngines,
      maxResults,
    );

    // Since we removed the slice, we expect ALL valid parsed results
    // mock1 returns 5, mock2 returns 5 -> total 10
    expect(results.length).toBe(10);

    // Verify we have results from both
    const sources = new Set(results.flatMap((r) => r.engines));
    expect(sources.has("mock1")).toBe(true);
    expect(sources.has("mock2")).toBe(true);
  });

  it("should handle mixed engine availability", async () => {
    const maxResults = 3;
    const requestedEngines = ["mock1", "nonexistent", "mock2"];

    const results = await executeMultiEngineSearch(
      "test query",
      requestedEngines,
      maxResults,
    );

    // Should verify it only called available engines
    expect(mockEngines.get("mock1")!.search).toHaveBeenCalled();
    expect(mockEngines.get("mock2")!.search).toHaveBeenCalled();

    // Total results: 3 from mock1 + 3 from mock2 = 6
    expect(results.length).toBe(6);
  });

  describe("skipCooldown config", () => {
    it("should skip rate-limited engines when skipCooldown=false", async () => {
      // Mock one engine as rate-limited
      mockEngines.set("mock1", createMockEngine("mock1", true)); // rate-limited
      mockEngines.set("mock2", createMockEngine("mock2", false));

      vi.spyOn(Config, "getConfig").mockReturnValue(
        createMockConfig(false) as AppConfig,
      );

      const results = await executeMultiEngineSearch(
        "test query",
        ["mock1", "mock2"],
        3,
      );

      // Only mock2 should be called (mock1 is rate-limited)
      expect(mockEngines.get("mock1")!.search).not.toHaveBeenCalled();
      expect(mockEngines.get("mock2")!.search).toHaveBeenCalled();

      // Only 3 results from mock2
      expect(results.length).toBe(3);
    });

    it("should include rate-limited engines when skipCooldown=true", async () => {
      // Mock one engine as rate-limited
      mockEngines.set("mock1", createMockEngine("mock1", true)); // rate-limited
      mockEngines.set("mock2", createMockEngine("mock2", false));

      vi.spyOn(Config, "getConfig").mockReturnValue(
        createMockConfig(true) as AppConfig,
      );

      const results = await executeMultiEngineSearch(
        "test query",
        ["mock1", "mock2"],
        3,
      );

      // Both engines should be called (skipCooldown ignores rate limit)
      expect(mockEngines.get("mock1")!.search).toHaveBeenCalled();
      expect(mockEngines.get("mock2")!.search).toHaveBeenCalled();

      // 3 from mock1 + 3 from mock2 = 6
      expect(results.length).toBe(6);
    });

    it("should respect skipCooldown even when all engines are rate-limited", async () => {
      // Both engines rate-limited
      mockEngines.set("mock1", createMockEngine("mock1", true));
      mockEngines.set("mock2", createMockEngine("mock2", true));

      vi.spyOn(Config, "getConfig").mockReturnValue(
        createMockConfig(true) as AppConfig,
      );

      const results = await executeMultiEngineSearch(
        "test query",
        ["mock1", "mock2"],
        3,
      );

      // Both should be called despite rate limiting
      expect(mockEngines.get("mock1")!.search).toHaveBeenCalled();
      expect(mockEngines.get("mock2")!.search).toHaveBeenCalled();

      expect(results.length).toBe(6);
    });
  });
});
