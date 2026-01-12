import { MergedSearchResult } from "../../types/MergedSearchResult.js";
import { getConfig } from "../../config/index.js";
import { buildSamplingPrompt } from "./prompts/index.js";
import { SamplingFilterOptions } from "../../types/SamplingFilterOptions.js";
import { callLLM, isLLMAvailable } from "../../infrastructure/callLLM.js";

/**
 * Formats search results as a numbered list for LLM evaluation.
 */
const formatResultsForEvaluation = (results: MergedSearchResult[]): string => {
  return results
    .map(
      (result, index) =>
        `${index + 1}. [${result.title}] (${result.engines.join(", ")}) - ${
          result.description
        }`,
    )
    .join("\n");
};

/**
 * Parses the LLM response to extract approved result indices.
 * Expects comma-separated numbers like "1,3,5,7"
 */
const parseApprovedIndices = (response: string): number[] => {
  if (!response) return [];

  const results: number[] = [];

  // Find the first numeric sequence
  const firstMatch = response.match(/\d+/);
  if (!firstMatch) return [];

  results.push(parseInt(firstMatch[0], 10));

  let remainingText = response.slice(firstMatch.index! + firstMatch[0].length);

  // Iteratively look for next numbers separated by valid delimiters
  const nextPattern = /^[\s,]*\s*(?:and|&)?\s*(\d+)/i;

  while (remainingText) {
    const match = remainingText.match(nextPattern);
    if (match) {
      results.push(parseInt(match[1], 10));
      remainingText = remainingText.slice(match[0].length);
    } else {
      break;
    }
  }

  return results
    .map((num) => num - 1) // Convert to 0-indexed
    .filter((index) => index >= 0);
};

const SAMPLING_SYSTEM_PROMPT =
  "You are a helpful assistant evaluating search results for relevance and quality.";

/**
 * Filters search results using LLM-based relevance evaluation.
 * Uses the centralized callLLM utility for all LLM interactions.
 */
export const filterResultsWithSampling = async (
  options: SamplingFilterOptions,
): Promise<MergedSearchResult[]> => {
  const { query, results, maxResults } = options;
  if (results.length === 0) return [];

  const config = getConfig();

  // Early exit if sampling is not allowed
  if (!config.llm.samplingAllowed) {
    console.debug("[Sampling] Sampling not allowed. Returning raw results.");
    return results.slice(0, maxResults);
  }

  // Check if any LLM is available
  if (!isLLMAvailable()) {
    console.debug("[Sampling] No LLM available. Returning raw results.");
    return results.slice(0, maxResults);
  }

  // Build the prompt
  const formattedResults = formatResultsForEvaluation(results);
  const userPrompt = buildSamplingPrompt(query, formattedResults);

  try {
    const llmResult = await callLLM(
      {
        systemPrompt: SAMPLING_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: 100,
        temperature: 0,
      },
      options.server,
    );

    console.debug(
      `[Sampling] Decision received via ${llmResult.provider}: ${llmResult.text}`,
    );

    // Handle "none" response
    if (llmResult.text.toLowerCase().includes("none")) {
      return [];
    }

    // Parse approved indices
    const approvedIndices = parseApprovedIndices(llmResult.text);

    if (approvedIndices.length === 0) {
      console.debug(
        "[Sampling] No valid indices parsed. Returning unfiltered.",
      );
      return results.slice(0, maxResults);
    }

    const filteredResults = approvedIndices
      .filter((index) => index < results.length)
      .map((index) => results[index])
      .slice(0, maxResults);

    console.debug(`[Sampling] Filtered to ${filteredResults.length} results.`);
    return filteredResults;
  } catch (error) {
    console.debug("[Sampling] LLM call failed:", error);
    return results.slice(0, maxResults);
  }
};
