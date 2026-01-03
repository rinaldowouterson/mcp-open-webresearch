import { fetchBravePage } from "../../fetch/index.js";
import * as cheerio from "cheerio";
import { SearchResult } from "../../../types/search.js";
import { cooldown, touch } from "../throttle.js";

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

      const titleElement = resultElement.find(".title");
      const title = titleElement.text().trim();

      // The URL is usually on the anchor tag that wraps the title, or a sibling
      let url = titleElement.closest("a").attr("href");

      // Fallback: look for the first anchor if title is not inside one
      if (!url) {
        url = resultElement.find("a").first().attr("href");
      }

      if (!url || !url.startsWith("http")) {
        return null;
      }

      let description = resultElement
        .find(".snippet-description")
        .text()
        .trim();

      // New selector for browser-like fetch
      if (!description) {
        description = resultElement
          .find(".generic-snippet .content")
          .text()
          .trim();
      }

      const source =
        resultElement.find(".sitename").text().trim() ||
        resultElement.find(".site-name-content").text().trim();

      const searchResult: SearchResult = {
        title,
        url,
        description,
        engine: "brave",
      };

      return searchResult;
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
  limit: number,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  for (let page = 0; page < MAX_PAGES && results.length < limit; page++) {
    try {
      const offset = page * RESULTS_PER_PAGE;

      // Wait for page cooldown between pagination requests
      if (page > 0) {
        await cooldown("brave");
      }

      touch("brave");
      const html = await fetchBravePage(query, offset);
      const $ = cheerio.load(html);
      const pageResults = parseResults($);

      if (pageResults.length === 0 && results.length === 0) {
        return [];
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

  return results.slice(0, limit);
}
