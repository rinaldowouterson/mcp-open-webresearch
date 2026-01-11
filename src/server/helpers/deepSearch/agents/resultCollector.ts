/**
 * ResultCollector Agent
 *
 * Executes search queries and collects results.
 * This is a pure function with no LLM calls.
 */

import { executeMultiEngineSearch } from "../../executeMultiEngineSearch.js";
import { getConfig } from "../../../../config/index.js";
import type { MergedSearchResult } from "../../../../types/MergedSearchResult.js";
import type { QueryEntry } from "../contextSheet.js";

export interface ResultCollectorConfig {
  resultsPerEngine: number;
  engines?: string[];
}

export interface ResultCollectorResult {
  results: MergedSearchResult[];
  queriesExecuted: number;
  totalResults: number;
}

/**
 * Deduplicate results by URL (case-insensitive, protocol-agnostic).
 */
function deduplicateByUrl(results: MergedSearchResult[]): MergedSearchResult[] {
  const seen = new Set<string>();
  const unique: MergedSearchResult[] = [];

  for (const result of results) {
    // Normalize URL for deduplication
    const normalizedUrl = result.url
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/$/, "");

    if (!seen.has(normalizedUrl)) {
      seen.add(normalizedUrl);
      unique.push(result);
    }
  }

  return unique;
}

/**
 * Execute the ResultCollector agent.
 * Runs all queries through the search engine and collects results.
 * Throttle handling is delegated to executeMultiEngineSearch (respects config.skipCooldown).
 */
export async function executeResultCollector(
  queries: QueryEntry[],
  config?: Partial<ResultCollectorConfig>,
  signal?: AbortSignal,
): Promise<ResultCollectorResult> {
  const appConfig = getConfig();

  const resultsPerEngine =
    config?.resultsPerEngine ?? appConfig.deepSearch.resultsPerEngine;
  const engines = config?.engines ?? appConfig.defaultSearchEngines;

  console.debug(
    `[ResultCollector] Executing ${queries.length} queries with ${resultsPerEngine} results/engine using engines: ${engines.join(", ")}`,
  );

  const allResults: MergedSearchResult[] = [];
  let queryIndex = 0;

  for (const query of queries) {
    // Check for cancellation before each query
    if (signal?.aborted) {
      console.debug(`[ResultCollector] Cancelled after ${queryIndex} queries`);
      break;
    }

    queryIndex++;

    console.debug(
      `[ResultCollector] [${queryIndex}/${queries.length}] Searching: "${query.query}"`,
    );
    try {
      const results = await executeMultiEngineSearch(
        query.query,
        engines,
        resultsPerEngine,
      );
      allResults.push(...results);
      console.debug(
        `[ResultCollector] [${queryIndex}/${queries.length}] Found ${results.length} results for "${query.query}"`,
      );
    } catch (error: any) {
      console.debug(
        `[ResultCollector] [${queryIndex}/${queries.length}] Query failed: "${query.query}" - ${error.message}`,
      );
      // Continue with other queries
    }
  }

  // Deduplicate by URL
  const unique = deduplicateByUrl(allResults);

  console.debug(
    `[ResultCollector] Complete: ${allResults.length} raw results, ${unique.length} unique after dedup`,
  );

  return {
    results: unique,
    queriesExecuted: queryIndex,
    totalResults: unique.length,
  };
}
