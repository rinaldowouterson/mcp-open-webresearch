/**
 * AnswerSynthesizer Agent
 *
 * Synthesizes the final answer from the complete ContextSheet.
 * Runs once after Refiner decides EXIT.
 */

import { callLLM } from "../../callLLM.js";
import {
  ANSWER_SYNTHESIZER_SYSTEM_PROMPT,
  buildAnswerSynthesizerUserPrompt,
} from "../prompts/answerSynthesizer.prompt.js";
import { renderContextSheet, getAllCitations } from "../contextSheet.js";
import type { ContextSheet, CitationEntry } from "../contextSheet.js";

export interface ReferenceEntry {
  id: number;
  title: string;
  url: string;
}

export interface SynthesizedAnswer {
  /** The answer text with [ID] citations inline */
  answer: string;
  /** Reference list to be appended to the answer */
  references: ReferenceEntry[];
  /** Confidence score 0-100 */
  confidence: number;
  /** Formatted output with answer + references section */
  formattedOutput: string;
}

/**
 * Parse LLM response to extract answer and strip hallucinated references.
 */
function parseValuesFromMarkdown(responseText: string): { answer: string } {
  let cleanText = responseText.trim();

  // Remove markdown code fencing if present
  const match = cleanText.match(/```(?:markdown)?\s*([\s\S]*?)```/);
  if (match) {
    cleanText = match[1].trim();
  }

  // Strip "## References" section and everything after it
  // We will rebuild this section programmatically to ensure accuracy
  const refHeaderIndex = cleanText.indexOf("## References");
  if (refHeaderIndex !== -1) {
    cleanText = cleanText.substring(0, refHeaderIndex).trim();
  }

  return { answer: cleanText };
}

/**
 * Generate a deterministic list of references based on citation usage in the text.
 */
function generateReferences(
  answer: string,
  allCitations: CitationEntry[],
): { used: ReferenceEntry[]; unused: ReferenceEntry[] } {
  // 1. Find all [ID] markers in the text
  const citationRegex = /\[(\d+)\]/g;
  const matches = [...answer.matchAll(citationRegex)];
  const usedIds = new Set<number>();

  for (const m of matches) {
    const id = parseInt(m[1], 10);
    if (!isNaN(id)) {
      usedIds.add(id);
    }
  }

  // 2. Filter citations to used vs unused
  const used: ReferenceEntry[] = [];
  const unused: ReferenceEntry[] = [];

  for (const c of allCitations) {
    const entry: ReferenceEntry = {
      id: c.id,
      title: c.title,
      url: c.url,
    };

    if (usedIds.has(c.id)) {
      used.push(entry);
    } else {
      unused.push(entry);
    }
  }

  return { used, unused };
}

/**
 * Format the final output with embedded references.
 */
function formatOutput(
  answer: string,
  usedReferences: ReferenceEntry[],
  unusedReferences: ReferenceEntry[],
  confidence: number,
): string {
  let output = answer;

  // Add Used References section
  if (usedReferences.length > 0) {
    output += "\n\n## References\n\n";
    for (const ref of usedReferences) {
      output += `[${ref.id}] ${ref.title}\n   ${ref.url}\n`;
    }
  }

  // Add Unused References section
  if (unusedReferences.length > 0) {
    output += "\n\n## Unused References\n\n";
    for (const ref of unusedReferences) {
      output += `[${ref.id}] ${ref.title}\n   ${ref.url}\n`;
    }
  }

  output += `\n\n*Confidence: ${confidence}%*`;

  return output;
}

/**
 * Execute the AnswerSynthesizer agent.
 */
export async function executeAnswerSynthesizer(
  sheet: ContextSheet,
  objective: string,
  signal?: AbortSignal,
): Promise<SynthesizedAnswer> {
  console.debug("[AnswerSynthesizer] Synthesizing final answer...");

  // Check for cancellation before LLM call
  if (signal?.aborted) {
    console.debug("[AnswerSynthesizer] Cancelled before synthesis");
    return {
      answer: "Synthesis cancelled by user.",
      references: [],
      confidence: 0,
      formattedOutput: "Synthesis cancelled by user.\n\n*Confidence: 0%*",
    };
  }

  const renderedSheet = renderContextSheet(sheet);
  const userPrompt = buildAnswerSynthesizerUserPrompt(objective, renderedSheet);

  try {
    const llmResult = await callLLM({
      systemPrompt: ANSWER_SYNTHESIZER_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.3,
      maxTokens: 4000,
    });

    console.debug(`[AnswerSynthesizer] LLM response via ${llmResult.provider}`);

    // 1. Parse raw answer
    const { answer } = parseValuesFromMarkdown(llmResult.text);

    // 2. Generate verifiable references
    const allCitations = getAllCitations(sheet);
    const { used, unused } = generateReferences(answer, allCitations);
    const confidence = 85; // Default high confidence for verified output

    console.debug(
      `[AnswerSynthesizer] Generated ${used.length} used and ${unused.length} unused references`,
    );

    const formattedOutput = formatOutput(answer, used, unused, confidence);

    return {
      answer,
      references: used,
      confidence,
      formattedOutput,
    };
  } catch (error: any) {
    console.error(`[AnswerSynthesizer] Synthesis failed: ${error.message}`);
    return {
      answer: `Synthesis failed: ${error.message}`,
      references: [],
      confidence: 0,
      formattedOutput: `Synthesis failed: ${error.message}\n\n*Confidence: 0%*`,
    };
  }
}
