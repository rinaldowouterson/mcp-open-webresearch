import { fetchBravePage } from "../fetch/index.js";
import * as cheerio from "cheerio";
import { SearchResult } from "../../types/search.js";

const MAX_PAGES = 10;
const RESULTS_PER_PAGE = 10;

/**
 * Extracts search results from Brave HTML content
 * @param $ Cheerio root instance
 * @returns Array of parsed search results
 */
function parseResults($: cheerio.Root): SearchResult[] {
  const resultsContainer = $("#results");

  return resultsContainer
    .find(".snippet")
    .map((index, element) => {
      const resultElement = $(element);

      const title = resultElement.find(".title").text().trim();
      const url = resultElement.find("a.heading-serpresult").attr("href");

      if (!url || !url.startsWith("http")) {
        return null;
      }

      const description = resultElement
        .find(".snippet-description")
        .text()
        .trim();

      const source = resultElement.find(".sitename").text().trim();

      return {
        title,
        url,
        description,
        source,
        engine: "brave",
      };
    })
    .get()
    .filter(Boolean) as SearchResult[];
}

/**
 * Executes Brave search with proper pagination and error handling
 * @param query Search query
 * @param limit Maximum results to return
 * @returns Array of search results
 */
export async function searchBrave(
  query: string,
  limit: number
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  for (let page = 0; page < MAX_PAGES && results.length < limit; page++) {
    try {
      const offset = page * RESULTS_PER_PAGE;
      const html = await fetchBravePage(query, offset);
      const $ = cheerio.load(html);
      const pageResults = parseResults($);

      if (pageResults.length === 0 && results.length === 0) {
        return [
          {
            title: "No results found",
            url: "",
            description: "Your search didn't return any results",
            source: "brave",
            engine: "brave",
          },
        ];
      }

      results.push(...pageResults);

      if (pageResults.length === 0) {
        break;
      }
    } catch (error) {
      console.error(`Error fetching Brave page ${page + 1}:`, error);

      if (results.length > 0) {
        return results.slice(0, limit);
      }

      throw error;
    }
  }

  // Update last request time after a successful operational attempt (even if it failed per page)
  lastRequestTime = Date.now();
  return results.slice(0, limit);
}

// Track the last time Brave was used
let lastRequestTime = 0;
const BRAVE_COOLDOWN_MS = 5000;

export function isBraveRateLimited(): boolean {
  const timeSinceLastRequest = Date.now() - lastRequestTime;
  return timeSinceLastRequest < BRAVE_COOLDOWN_MS;
}

export const resetLastRequestTime = () => {
  lastRequestTime = 0;
};
