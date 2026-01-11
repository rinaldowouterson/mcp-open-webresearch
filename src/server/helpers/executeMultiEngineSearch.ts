import { SearchResult } from "../../types/index.js";
import { getEngines } from "../../engines/search/registry.js";
import { mergeSearchResults } from "./signalProcessor.js";
import { MergedSearchResult } from "../../types/MergedSearchResult.js";
import { getConfig } from "../../config/index.js";

/**
 * Executes search across specified engines using dynamic registry.
 * Returns merged results with consensus scoring.
 *
 * NOTE: maxResults is applied PER ENGINE.
 * If you request 10 results and use 3 engines, you may process up to 30 raw results
 * before deduplication and merging.
 *
 * Respects config.deepSearch.skipCooldown - if true, ignores rate limiting.
 */
export const executeMultiEngineSearch = async (
  query: string,
  engines: string[],
  maxResults: number,
): Promise<MergedSearchResult[]> => {
  const cleanQuery = query.trim();
  if (!cleanQuery) throw new Error("Search query cannot be empty");

  const config = getConfig();
  const skipCooldown = config.skipCooldown;

  const allEngines = await getEngines();

  // Filter out rate-limited engines (unless skipCooldown is true)
  const availableEngines = engines.filter((name) => {
    const engine = allEngines.get(name);
    if (!engine) {
      console.debug(`Engine "${name}" not found in registry, skipping`);
      return false;
    }
    if (!skipCooldown && engine.isRateLimited()) {
      console.debug(`Engine "${name}" is rate-limited, skipping`);
      return false;
    }
    return true;
  });

  // Fallback if all requested engines are unavailable
  if (availableEngines.length === 0) {
    console.debug(
      "All requested engines unavailable, using first available engine",
    );
    const firstAvailable = Array.from(allEngines.entries()).find(
      ([_, e]) => !e.isRateLimited(),
    );
    if (firstAvailable) {
      availableEngines.push(firstAvailable[0]);
    } else {
      console.debug("No engines available");
      return [];
    }
  }

  // Fan-out: Execute all searches in parallel
  // We request maxResults from EACH engine (additive strategy)
  const searchPromises = availableEngines.map((name) => {
    const engine = allEngines.get(name)!;
    return engine.search(cleanQuery, maxResults);
  });

  // Use Promise.allSettled for resilience (partial results on failure)
  const results = await Promise.allSettled(searchPromises);

  // Fan-in: Aggregate successful results
  const successfulResults = results
    .filter(
      (r): r is PromiseFulfilledResult<SearchResult[]> =>
        r.status === "fulfilled",
    )
    .flatMap((r) => r.value);

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.debug(
      `${failures.length} engine(s) failed:`,
      failures.map((f) => (f as PromiseRejectedResult).reason),
    );
  }

  // Debug: Log all raw results for inspection
  console.debug(
    `[Search] Aggregated ${successfulResults.length} raw results before merging:`,
  );
  successfulResults.forEach((res, i) => {
    console.debug(`  ${i + 1}. [${res.engine}] ${res.title} - ${res.url}`);
  });

  // Merge and rank results by consensus
  // The merge logic handles deduplication properly
  const mergedResults = mergeSearchResults(successfulResults);

  return mergedResults;
};
