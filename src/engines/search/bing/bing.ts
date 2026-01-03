import { fetchBingPage } from "../../fetch/index.js";
import * as cheerio from "cheerio";
import { SearchResult } from "../../../types/search.js";

const MAX_PAGES = 10;

/**
 * Resolves Bing's click-tracking redirects (ck/a URLs)
 * These URLs contain a Base64 encoded destination in the 'u' parameter.
 */
export function resolveRedirect(url: string | undefined): string | null {
  if (!url) return null;
  if (!url.includes("/ck/a")) return url;

  try {
    const urlObj = new URL(url);
    const uParam = urlObj.searchParams.get("u");

    // Bing's 'u' parameter typically starts with a 2-char prefix (e.g., 'a1' or 'a0')
    // followed by the Base64 encoded destination URL.
    if (uParam && uParam.length > 2) {
      const base64Part = uParam.substring(2);
      // Replace URL-safe characters if necessary (though usually standard base64)
      const normalizedBase64 = base64Part.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = Buffer.from(normalizedBase64, "base64").toString("utf-8");

      if (decoded.startsWith("http")) {
        return decoded;
      }
    }
  } catch (e) {
    // Fallback to original URL if decoding fails
    console.debug(`[Bing] Failed to resolve redirect: ${url}`);
  }

  return url;
}

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

      const rawUrl = linkElement.attr("href");
      const url = resolveRedirect(rawUrl);
      if (!url || !url.startsWith("http")) return null;

      return {
        title: titleElement.text().trim(),
        url,
        description: snippetElement.text().trim(),
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
  limit: number,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  for (let page = 0; page < MAX_PAGES && results.length < limit; page++) {
    try {
      const html = await fetchBingPage(query, page);
      const $ = cheerio.load(html);
      const pageResults = parseResults($);

      if (pageResults.length === 0 && results.length === 0) {
        return [];
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
