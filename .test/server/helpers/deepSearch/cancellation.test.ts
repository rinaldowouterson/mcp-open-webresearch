import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeQueryGenerator } from "../../../../src/server/helpers/deepSearch/agents/queryGenerator.js";
import { executeResultCollector } from "../../../../src/server/helpers/deepSearch/agents/resultCollector.js";
import { executeCitationExtractor } from "../../../../src/server/helpers/deepSearch/agents/citationExtractor.js";
import { executeRefiner } from "../../../../src/server/helpers/deepSearch/agents/refiner.js";
import { executeAnswerSynthesizer } from "../../../../src/server/helpers/deepSearch/agents/answerSynthesizer.js";
import * as CallLLM from "../../../../src/server/helpers/callLLM.js";
import * as Config from "../../../../src/config/index.js";
import * as Registry from "../../../../src/engines/search/registry.js";
import type { ContextSheet } from "../../../../src/server/helpers/deepSearch/contextSheet.js";
import type { MergedSearchResult } from "../../../../src/types/MergedSearchResult.js";
import type { SearchEngine } from "../../../../src/types/search.js";
import type { AppConfig } from "../../../../src/types/app-config.js";

/**
 * Offline unit tests for AbortSignal cancellation handling in deep search agents.
 * These tests verify that each agent respects the AbortSignal and stops early when aborted.
 */

// Create a pre-aborted signal for testing
function createAbortedSignal(): AbortSignal {
  const controller = new AbortController();
  controller.abort();
  return controller.signal;
}

// Create a minimal mock config
function createMockConfig(): Partial<AppConfig> {
  return {
    skipCooldown: true,
    deepSearch: {
      maxLoops: 3,
      resultsPerEngine: 3,
      saturationThreshold: 0.6,
      maxCitationUrls: 10,
      reportRetentionMinutes: 10,
    },
    defaultSearchEngines: ["mock"],
    browser: {
      concurrency: 4,
      idleTimeout: 300000,
      screenshotMaxSize: 5242880,
    },
    llm: {
      retryDelays: [1000, 2000],
    } as any,
  };
}

// Create a minimal mock ContextSheet
function createMockContextSheet(): ContextSheet {
  return {
    sessionId: "test-session",
    userInput: "Test objective",
    status: "ACTIVE",
    rounds: [
      {
        roundNumber: 1,
        queries: [],
        citations: [],
        refinerDecision: undefined,
        refinerFeedback: undefined,
      },
    ],
    metrics: {
      loopCount: 1,
      maxLoops: 3,
    },
  };
}

describe("Deep Search Agent Cancellation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Config, "getConfig").mockReturnValue(
      createMockConfig() as AppConfig,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("executeQueryGenerator", () => {
    it("should return empty result when signal is already aborted", async () => {
      const signal = createAbortedSignal();

      // Mock LLM should NOT be called
      const llmSpy = vi
        .spyOn(CallLLM, "callLLM")
        .mockResolvedValue({ text: "{}", provider: "none" });

      const result = await executeQueryGenerator("test context", signal);

      expect(result.queries).toEqual([]);
      expect(result.thoughtProcess).toBe("Cancelled");
      expect(llmSpy).not.toHaveBeenCalled();
    });

    it("should execute normally with non-aborted signal", async () => {
      const controller = new AbortController();

      vi.spyOn(CallLLM, "callLLM").mockResolvedValue({
        text: JSON.stringify({
          queries: [{ query: "test query" }],
          thoughtProcess: "test thought",
        }),
        provider: "none",
      });

      const result = await executeQueryGenerator(
        "test context",
        controller.signal,
      );

      expect(result.queries.length).toBe(1);
      expect(result.queries[0].query).toBe("test query");
    });
  });

  describe("executeResultCollector", () => {
    it("should return empty results when signal is already aborted", async () => {
      const signal = createAbortedSignal();

      // Create mock engine with spy
      const mockEngine: SearchEngine = {
        name: "mock",
        search: vi.fn().mockResolvedValue([]),
        isRateLimited: () => false,
      };
      const mockEngines = new Map([["mock", mockEngine]]);
      vi.spyOn(Registry, "getEngines").mockResolvedValue(mockEngines);

      const result = await executeResultCollector(
        [{ query: "test" }],
        undefined,
        signal,
      );

      expect(result.results).toEqual([]);
      expect(result.queriesExecuted).toBe(0);
      expect(mockEngine.search).not.toHaveBeenCalled();
    });

    it("should stop processing after signal is aborted mid-loop", async () => {
      const controller = new AbortController();
      let searchCallCount = 0;

      const mockEngine: SearchEngine = {
        name: "mock",
        search: vi.fn().mockImplementation(async () => {
          searchCallCount++;
          // Abort after first call
          if (searchCallCount === 1) {
            controller.abort();
          }
          return [
            { title: "Result", url: "https://example.com", engine: "mock" },
          ];
        }),
        isRateLimited: () => false,
      };
      const mockEngines = new Map([["mock", mockEngine]]);
      vi.spyOn(Registry, "getEngines").mockResolvedValue(mockEngines);

      const result = await executeResultCollector(
        [{ query: "test1" }, { query: "test2" }, { query: "test3" }],
        undefined,
        controller.signal,
      );

      // Only the first query was processed before abort was detected
      expect(result.queriesExecuted).toBe(1);
    });
  });

  describe("executeCitationExtractor", () => {
    it("should return empty citations when signal is already aborted", async () => {
      const signal = createAbortedSignal();

      const mockResults: MergedSearchResult[] = [
        {
          urlHash: "abc123",
          title: "Test",
          url: "https://example.com",
          description: "Test",
          engines: ["mock"],
          ranks: [1],
          consensusScore: 1,
        },
      ];

      const result = await executeCitationExtractor(
        mockResults,
        "test objective",
        10,
        [],
        1,
        signal,
      );

      expect(result.citations).toEqual([]);
      expect(result.visitedUrls).toEqual([]);
    });
  });

  describe("executeRefiner", () => {
    it("should exit with budget_exceeded when signal is already aborted", async () => {
      const signal = createAbortedSignal();
      const sheet = createMockContextSheet();

      // Mock LLM should NOT be called
      const llmSpy = vi
        .spyOn(CallLLM, "callLLM")
        .mockResolvedValue({ text: "{}", provider: "none" });

      const result = await executeRefiner(sheet, signal);

      expect(result.decision).toBe("EXIT");
      expect(result.feedback).toBe("Request cancelled");
      expect(llmSpy).not.toHaveBeenCalled();
    });
  });

  describe("executeAnswerSynthesizer", () => {
    it("should return cancelled message when signal is already aborted", async () => {
      const signal = createAbortedSignal();
      const sheet = createMockContextSheet();

      // Mock LLM should NOT be called
      const llmSpy = vi
        .spyOn(CallLLM, "callLLM")
        .mockResolvedValue({ text: "{}", provider: "none" });

      const result = await executeAnswerSynthesizer(
        sheet,
        "test objective",
        signal,
      );

      expect(result.answer).toBe("Synthesis cancelled by user.");
      expect(result.confidence).toBe(0);
      expect(llmSpy).not.toHaveBeenCalled();
    });
  });
});
