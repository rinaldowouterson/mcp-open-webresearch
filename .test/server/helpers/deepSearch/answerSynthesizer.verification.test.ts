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
});
