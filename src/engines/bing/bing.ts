import { fetchBingPage } from "../fetch/index.js";
import * as cheerio from "cheerio";
import { SearchResult } from "../../types/search.js";

const MAX_PAGES = 10;

/**
 * Extracts search results from Bing HTML content
 * @param $ Cheerio root instance
 * @returns Array of parsed search results
 */
function parseResults($: cheerio.Root): SearchResult[] {
  return $("#b_results > .b_algo")
    .map((i, element) => {
      const titleElement = $(element).find("h2");
      const linkElement = $(element).find("a").first();
      const snippetElement = $(element).find("p").first();
      const sourceElement = $(element).find(".b_attribution");

      const url = linkElement.attr("href");
      if (!url || !url.startsWith("http")) return null;

      return {
        title: titleElement.text().trim(),
        url,
        description: snippetElement.text().trim(),
        source: sourceElement.text().replace("https://", ": https://"),
        engine: "bing",
      };
    })
    .get()
    .filter(Boolean) as SearchResult[];
}

/**
 * Executes Bing search with proper pagination and error handling
 * @param query Search query
 * @param limit Maximum results to return
 * @returns Array of search results
 */
export async function searchBing(
  query: string,
  limit: number
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  for (let page = 0; page < MAX_PAGES && results.length < limit; page++) {
    try {
      const html = await fetchBingPage(query, page);
      const $ = cheerio.load(html);
      const pageResults = parseResults($);

      if (pageResults.length === 0 && results.length === 0) {
        return [
          {
            title: "No results found",
            url: "",
            description: "Your search didn't return any results",
            source: "bing",
            engine: "bing",
          },
        ];
      }

      results.push(...pageResults);
    } catch (error) {
      console.error(`Error fetching Bing page ${page + 1}:`, error);
      // Return partial results if we have any
      if (results.length > 0) return results.slice(0, limit);

      throw error;
    }
  }

  return results.slice(0, limit);
}
