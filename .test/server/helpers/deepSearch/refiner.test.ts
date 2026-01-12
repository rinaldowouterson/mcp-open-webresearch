import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeRefiner } from "../../../../src/server/helpers/deepSearch/agents/refiner.js";
import { buildRefinerUserPrompt } from "../../../../src/server/helpers/deepSearch/prompts/refiner.prompt.js";
import * as CallLLM from "../../../../src/server/helpers/callLLM.js";
import * as Config from "../../../../src/config/index.js";
import type { ContextSheet } from "../../../../src/server/helpers/deepSearch/contextSheet.js";
import type { AppConfig } from "../../../../src/types/app-config.js";

// Create a minimal mock config
function createMockConfig(): Partial<AppConfig> {
  return {
    deepSearch: {
      maxLoops: 20,
      resultsPerEngine: 3,
      saturationThreshold: 0.6,
      maxCitationUrls: 10,
      reportRetentionMinutes: 10,
    },
  };
}

// Create a minimal mock ContextSheet
function createMockContextSheet(
  currentLoop: number = 1,
  maxLoops: number = 20,
): ContextSheet {
  return {
    sessionId: "test-session",
    userInput: "Test objective",
    status: "ACTIVE",
    rounds: [],
    metrics: {
      loopCount: currentLoop,
      maxLoops: maxLoops,
    },
  };
}

describe("Refiner Budget Awareness", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Config, "getConfig").mockReturnValue(
      createMockConfig() as AppConfig,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("buildRefinerUserPrompt", () => {
    it("should include budget status in the prompt", () => {
      const renderedSheet = "Request: Test\nCurrent Answer: None";
      const prompt = buildRefinerUserPrompt(renderedSheet, 5, 20);

      expect(prompt).toContain("## Budget Status");
      expect(prompt).toContain("- Current Round: 5");
      expect(prompt).toContain("- Max Rounds: 20");
      expect(prompt).toContain("- Rounds Remaining: 15");
    });
  });

  describe("executeRefiner", () => {
    it("should pass correct loop metrics to the LLM via prompt", async () => {
      const sheet = createMockContextSheet(5, 20);

      // Mock LLM to return CONTINUE so we can inspect the call
      const llmSpy = vi.spyOn(CallLLM, "callLLM").mockResolvedValue({
        text: JSON.stringify({
          decision: "CONTINUE",
          reason: "continue",
          feedback: "more info",
        }),
        provider: "none",
      });

      await executeRefiner(sheet);

      expect(llmSpy).toHaveBeenCalledTimes(1);
      const callArgs = llmSpy.mock.calls[0][0];
      const userPrompt = callArgs.userPrompt;

      // Verify the prompt passed to LLM contains the budget info
      expect(userPrompt).toContain("- Current Round: 5");
      expect(userPrompt).toContain("- Max Rounds: 20");
      expect(userPrompt).toContain("- Rounds Remaining: 15");
    });
  });
});
