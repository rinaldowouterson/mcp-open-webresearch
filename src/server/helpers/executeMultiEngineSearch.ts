import { SearchResult, SupportedEngine } from "../../types/index.js";
import { searchBing } from "../../engines/bing/index.js";
import { searchDuckDuckGo } from "../../engines/duckduckgo/index.js";
import { searchBrave, isBraveRateLimited } from "../../engines/brave/index.js";
export const availableSearchEngines: Record<
  SupportedEngine,
  (query: string, limit: number) => Promise<SearchResult[]>
> = {
  bing: searchBing,
  duckduckgo: searchDuckDuckGo,
  brave: searchBrave,
};

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
 * Executes search across specified engines
 */
export const executeMultiEngineSearch = async (
  query: string,
  engines: string[],
  maxResults: number
): Promise<SearchResult[]> => {
  const cleanQuery = query.trim();
  if (!cleanQuery) throw new Error("Search query cannot be empty");

  // Check for Brave rate limiting
  const enginesToUse = [...engines];
  const braveIndex = enginesToUse.indexOf("brave");

  if (braveIndex !== -1 && isBraveRateLimited()) {
    console.debug("Brave rate limited, skipping...");
    enginesToUse.splice(braveIndex, 1);

    // If no engines left (e.g. user only asked for Brave), fallback to Bing and DDG
    if (enginesToUse.length === 0) {
      console.debug("Falling back to Bing and DuckDuckGo");
      enginesToUse.push("bing", "duckduckgo");
    }
  }

  // Distribute search limit across engines
  const engineLimits = distributeSearchLimit(maxResults, enginesToUse.length);

  const searchResultPromises = enginesToUse.map((engine, index) => {
    const currentSearchEngine =
      availableSearchEngines[engine as SupportedEngine];
    return currentSearchEngine
      ? currentSearchEngine(cleanQuery, engineLimits[index])
      : Promise.resolve([]);
  });

  try {
    const searchResults = await Promise.all(searchResultPromises);
    return searchResults.flat().slice(0, maxResults);
  } catch (error) {
    console.debug("Search execution failed:", error);
    return [];
  }
};
