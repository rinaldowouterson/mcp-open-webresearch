import { describe, it, expect, vi } from "vitest";
import { executeAnswerSynthesizer } from "../../../../src/server/helpers/deepSearch/agents/answerSynthesizer.js";
import {
  createContextSheet,
  startNewRound,
  appendCitations,
} from "../../../../src/server/helpers/deepSearch/contextSheet.js";
import * as callLLMModule from "../../../../src/server/helpers/callLLM.js";
import * as Config from "../../../../src/config/index.js";
import type { AppConfig } from "../../../../src/types/app-config.js";

// Mock Config
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
  };
}

describe("AnswerSynthesizer - Deterministic Citations", () => {
  vi.spyOn(Config, "getConfig").mockReturnValue(
    createMockConfig() as AppConfig,
  );

  it("should generate references section for used citations", async () => {
    // 1. Setup ContextSheet with citations 1 & 2
    let sheet = createContextSheet("sess1", "test", 3);
    sheet = startNewRound(sheet);
    sheet = appendCitations(sheet, [
      {
        id: 1,
        title: "Title 1",
        url: "url1",
        quality: "HIGH",
        qualityNote: "",
        quotes: [],
        rawMarkdown: "",
      },
      {
        id: 2,
        title: "Title 2",
        url: "url2",
        quality: "HIGH",
        qualityNote: "",
        quotes: [],
        rawMarkdown: "",
      },
      {
        id: 3,
        title: "Title 3",
        url: "url3",
        quality: "HIGH",
        qualityNote: "",
        quotes: [],
        rawMarkdown: "",
      },
    ]);

    // 2. Mock LLM to return answer using [1] and [3], but with NO references section
    vi.spyOn(callLLMModule, "callLLM").mockResolvedValue({
      text: "This answer cites [1] and [3] but ignores 2.",
      provider: "none",
    });

    // 3. Execute
    const result = await executeAnswerSynthesizer(sheet, "objective");

    // 4. Verify
    expect(result.answer).toBe("This answer cites [1] and [3] but ignores 2.");

    // Should have 2 references
    expect(result.references).toHaveLength(2);
    expect(result.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 1 }),
        expect.objectContaining({ id: 3 }),
      ]),
    );
    expect(result.references).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 2 })]),
    );

    // Formatted output should contain the section
    expect(result.formattedOutput).toContain("## References");
    expect(result.formattedOutput).toContain("[1] Title 1");
    expect(result.formattedOutput).toContain("[3] Title 3");

    // Formatted output should contain Unused References
    expect(result.formattedOutput).toContain("## Unused References");
    expect(result.formattedOutput).toContain("[2] Title 2");
  });

  it("should strip and replace hallucinated references", async () => {
    // 1. Setup ContextSheet with citation 1
    let sheet = createContextSheet("sess1", "test", 3);
    sheet = startNewRound(sheet);
    sheet = appendCitations(sheet, [
      {
        id: 1,
        title: "Real Title",
        url: "real-url",
        quality: "HIGH",
        qualityNote: "",
        quotes: [],
        rawMarkdown: "",
      },
    ]);

    // 2. Mock LLM to return answer using [1] but with HALLUCINATED reference section
    vi.spyOn(callLLMModule, "callLLM").mockResolvedValue({
      text: `Answer with [1].
      
      ## References
      [1] Wrong Title - wrong-url
      [99] Non-existent Source`,
      provider: "none",
    });

    // 3. Execute
    const result = await executeAnswerSynthesizer(sheet, "objective");

    // 4. Verify answer part is clean
    expect(result.answer).toBe("Answer with [1].");

    // Verify references are corrected
    expect(result.references).toHaveLength(1);
    expect(result.references[0].title).toBe("Real Title");
    expect(result.references[0].url).toBe("real-url");

    // Verify hallucinations are gone
    expect(result.formattedOutput).not.toContain("Wrong Title");
    expect(result.formattedOutput).not.toContain("Non-existent Source");
  });

  describe("calculateConfidence (Deterministic)", () => {
    it("should calculate correct confidence for scenarios", async () => {
      // Helper to run synth and get confidence
      const runScenario = async (
        citations: any[],
        llmResponse: string,
        status:
          | "ACTIVE"
          | "COMPLETED"
          | "BUDGET_EXCEEDED"
          | "ERROR" = "COMPLETED",
      ) => {
        let sheet = createContextSheet("sess1", "test", 3);
        sheet.status = status;
        sheet = startNewRound(sheet);
        sheet = appendCitations(sheet, citations);

        vi.spyOn(callLLMModule, "callLLM").mockResolvedValue({
          text: llmResponse,
          provider: "none",
        });

        const result = await executeAnswerSynthesizer(sheet, "objective");
        return result.confidence;
      };

      // Scenario 1: Perfect run (Completed, >1 High Quality)
      // 100 base - 0 status - 0 quantity - 0 quality = 100
      const score1 = await runScenario(
        [
          { id: 1, quality: "HIGH", title: "T1", url: "u1", quotes: [] },
          { id: 2, quality: "HIGH", title: "T2", url: "u2", quotes: [] },
        ],
        "Answer with [1] and [2].",
      );
      expect(score1).toBe(100);

      // Scenario 2: Single source penalty
      // 100 base - 0 status - 20 quantity - 0 quality = 80
      const score2 = await runScenario(
        [{ id: 1, quality: "HIGH", title: "T1", url: "u1", quotes: [] }],
        "Answer with [1].",
      );
      expect(score2).toBe(80);

      // Scenario 3: Quality penalty (1 High, 1 Low)
      // 100 base - 0 status - 0 quantity - 0 (High) - 10 (Low) = 90
      const score3 = await runScenario(
        [
          { id: 1, quality: "HIGH", title: "T1", url: "u1", quotes: [] },
          { id: 2, quality: "LOW", title: "T2", url: "u2", quotes: [] },
        ],
        "Answer with [1] and [2].",
      );
      expect(score3).toBe(90);

      // Scenario 4: Budget Exceeded penalty
      // 100 base - 20 status - 0 quantity - 0 quality = 80
      const score4 = await runScenario(
        [
          { id: 1, quality: "HIGH", title: "T1", url: "u1", quotes: [] },
          { id: 2, quality: "HIGH", title: "T2", url: "u2", quotes: [] },
        ],
        "Answer with [1] and [2].",
        "BUDGET_EXCEEDED",
      );
      expect(score4).toBe(80);

      // Scenario 5: Rejected source penalty (massive hit)
      // 100 base - 0 status - 20 quantity (only 1 used) - 50 (Rejected) = 30
      // Wait, if 1 used, quantity penalty applies.
      // 100 - 20 - 50 = 30.
      const score5 = await runScenario(
        [{ id: 1, quality: "REJECTED", title: "T1", url: "u1", quotes: [] }],
        "Answer with [1].",
      );
      expect(score5).toBe(30);

      // Scenario 6: Zero used references
      const score6 = await runScenario(
        [{ id: 1, quality: "HIGH", title: "T1", url: "u1", quotes: [] }],
        "Answer without citations.",
      );
      expect(score6).toBe(0);
    });
  });
});
