import { getConfig } from "../../config/index.js";
import { smartFetch } from "./client.js";

function fetchLogs() {
  const config = getConfig();
  console.debug(`fetch: Config enabled? ${config.proxy.enabled}`);
  console.debug(`fetch: Proxy URL:`, config.proxy.url);
}

/**
 * Fetches a page of Bing search results
 * @param query Search query
 * @param page Page number (0-indexed)
 * @returns HTML content string
 * @throws Error if request fails
 */

async function fetchBingPage(query: string, page: number): Promise<string> {
  try {
    fetchLogs();

    const params = new URLSearchParams({
      q: query,
      first: (1 + page * 10).toString(),
      mkt: "en-US",
      setlang: "en-US",
      cc: "US",
      ensearch: "1",
    });

    const url = `https://www.bing.com/search?${params.toString()}`;
    console.debug(`fetch: Fetching Bing page (browser-like): ${url}`);

    // Bing requires browser impersonation
    return await smartFetch(url, { browserMode: true });
  } catch (error) {
    throw new Error(
      `Bing search failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Fetches a page of Brave search results
 * @param query Search query
 * @param offset Result offset for pagination
 * @returns HTML content string
 * @throws Error if request fails
 */
async function fetchBravePage(query: string, offset: number): Promise<string> {
  try {
    fetchLogs();

    const params = new URLSearchParams({
      q: query,
      source: "web",
      offset: offset.toString(),
    });

    const url = `https://search.brave.com/search?${params.toString()}`;
    console.debug(`fetch: Fetching Brave page (browser-like): ${url}`);

    // Brave requires browser impersonation
    return await smartFetch(url, { browserMode: true });
  } catch (error) {
    throw new Error(
      `Brave search failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Fetches content from DuckDuckGo
 * @param url URL to fetch
 * @returns HTML content string
 * @throws Error if request fails
 */
async function fetchDuckDuckGo(url: string): Promise<string> {
  fetchLogs();
  // DuckDuckGo prefers standard http client (no TLS fingerprinting/impersonation)
  // We explicitly disable browser mode.
  return await smartFetch(url, { browserMode: false });
}

/**
 * Fetches the initial DuckDuckGo search page
 * @param query search query string
 * @returns HTML content string
 */
async function fetchDuckDuckSearchPage(query: string): Promise<string> {
  return fetchDuckDuckGo(
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}&t=h_&ia=web`,
  );
}

/**
 * Fetches API results from DuckDuckGo
 * @param apiUrlFromHTML API URL extracted from HTML
 * @param offset Result offset
 * @returns JSON content string
 */
async function fetchDuckDuckApiResults(
  apiUrlFromHTML: string,
  offset: number,
): Promise<string> {
  // Construct the final API URL with offset
  const apiUrlWithOffset = ((): string => {
    const generatedUrlWithOffset = new URL(apiUrlFromHTML);
    generatedUrlWithOffset.searchParams.set("s", offset.toString());
    return generatedUrlWithOffset.toString();
  })();
  return fetchDuckDuckGo(apiUrlWithOffset);
}

export {
  fetchBingPage,
  fetchBravePage,
  fetchDuckDuckSearchPage,
  fetchDuckDuckApiResults,
};
