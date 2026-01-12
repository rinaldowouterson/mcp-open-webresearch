/**
 * QueryGenerator Agent
 *
 * Translates the ContextSheet into search queries.
 * This is the first agent in the research loop.
 */

import {
  QUERY_GENERATOR_SYSTEM_PROMPT,
  buildQueryGeneratorUserPrompt,
} from "../prompts/queryGenerator.prompt.js";
import { callLLM } from "../../../infrastructure/callLLM.js";
import type { QueryEntry } from "../contextSheet.js";

interface QueryGeneratorResult {
  queries: QueryEntry[];
  thoughtProcess: string;
}

interface LLMQueryResponse {
  queries: { query: string; rationale?: string }[];
  thoughtProcess: string;
}

/**
 * Parse LLM response to extract queries.
 */
function parseQueryResponse(responseText: string): QueryGeneratorResult {
  // Try to extract JSON from response
  let jsonText = responseText.trim();

  // Remove markdown code fencing if present
  const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }

  try {
    const parsed: LLMQueryResponse = JSON.parse(jsonText);

    return {
      queries: parsed.queries.map((q) => ({
        query: q.query,
        rationale: q.rationale,
      })),
      thoughtProcess: parsed.thoughtProcess || "",
    };
  } catch {
    console.debug(
      "[QueryGenerator] Failed to parse JSON, extracting queries...",
    );

    // Fallback: try to extract query-like strings
    const queries: QueryEntry[] = [];
    const lines = responseText.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      // Look for quoted strings or list items
      const match = trimmed.match(/["']([^"']+)["']|^[-*]\s*(.+)$/);
      if (match) {
        const query = match[1] || match[2];
        if (query && query.length > 5 && query.length < 200) {
          queries.push({ query: query.trim() });
        }
      }
    }

    if (queries.length === 0) {
      throw new Error("Could not parse any queries from LLM response");
    }

    return { queries, thoughtProcess: "Fallback parsing" };
  }
}

/**
 * Execute the QueryGenerator agent.
 */
export async function executeQueryGenerator(
  contextSheetMarkdown: string,
  signal?: AbortSignal,
): Promise<QueryGeneratorResult> {
  // Check for cancellation before LLM call
  if (signal?.aborted) {
    console.debug("[QueryGenerator] Cancelled before execution");
    return { queries: [], thoughtProcess: "Cancelled" };
  }

  const userPrompt = buildQueryGeneratorUserPrompt(contextSheetMarkdown);

  const result = await callLLM({
    systemPrompt: QUERY_GENERATOR_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.7,
    maxTokens: 1000,
  });

  console.debug(`[QueryGenerator] Response via ${result.provider}:`);
  console.debug(result.text);

  const parsed = parseQueryResponse(result.text);

  console.debug(`[QueryGenerator] Parsed ${parsed.queries.length} queries:`);
  for (const q of parsed.queries) {
    console.debug(`  - "${q.query}"`);
  }

  return parsed;
}
