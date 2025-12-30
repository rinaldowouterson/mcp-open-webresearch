import { SearchResult } from "../../types/index.js";
import { getEngines } from "../../engines/search/registry.js";

/**
 * Distributes search limit across multiple engines
 */
export const distributeSearchLimit = (
  totalLimit: number,
  engineCount: number
): number[] => {
  const base = Math.floor(totalLimit / engineCount);
  const remainder = totalLimit % engineCount;
  return Array.from(
    { length: engineCount },
    (_, i) => base + (i < remainder ? 1 : 0)
  );
};

/**
 * Executes search across specified engines using dynamic registry
 */
export const executeMultiEngineSearch = async (
  query: string,
  engines: string[],
  maxResults: number
): Promise<SearchResult[]> => {
  const cleanQuery = query.trim();
  if (!cleanQuery) throw new Error("Search query cannot be empty");

  const allEngines = await getEngines();

  // Filter out rate-limited engines
  const availableEngines = engines.filter((name) => {
    const engine = allEngines.get(name);
    if (!engine) {
      console.debug(`Engine "${name}" not found in registry, skipping`);
      return false;
    }
    if (engine.isRateLimited()) {
      console.debug(`Engine "${name}" is rate-limited, skipping`);
      return false;
    }
    return true;
  });

  // Fallback if all requested engines are unavailable
  if (availableEngines.length === 0) {
    console.debug("All requested engines unavailable, using first available engine");
    const firstAvailable = Array.from(allEngines.entries())
      .find(([_, e]) => !e.isRateLimited());
    if (firstAvailable) {
      availableEngines.push(firstAvailable[0]);
    } else {
      console.debug("No engines available");
      return [];
    }
  }

  // Distribute search limit across engines
  const engineLimits = distributeSearchLimit(maxResults, availableEngines.length);

  // Fan-out: Execute all searches in parallel
  const searchPromises = availableEngines.map((name, index) => {
    const engine = allEngines.get(name)!;
    return engine.search(cleanQuery, engineLimits[index]);
  });

  // Use Promise.allSettled for resilience (partial results on failure)
  const results = await Promise.allSettled(searchPromises);

  // Fan-in: Aggregate successful results
  const successfulResults = results
    .filter((r): r is PromiseFulfilledResult<SearchResult[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.debug(`${failures.length} engine(s) failed:`, failures.map((f) => (f as PromiseRejectedResult).reason));
  }

  return successfulResults.slice(0, maxResults);
};
