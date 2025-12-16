import axios from "axios";
import { loadConfig } from "../../config/loader.js";

const config = loadConfig();
if (config.proxy.enabled && config.proxy.isValid && config.proxy.agent) {
  axios.defaults.httpAgent = config.proxy.agent.http;
  axios.defaults.httpsAgent = config.proxy.agent.https;
}

function fetchLogs() {
  console.debug(`fetch: Config enabled? ${config.proxy.enabled}`);
  console.debug(`fetch: Proxy agent:`, axios.defaults.httpAgent);
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
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Charset": "utf-8",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    DNT: "1",
    Referer: "https://www.bing.com/",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-User": "?1",
    "Sec-Fetch-Dest": "document",
  };

  try {
    fetchLogs();
    const response = await axios.get("https://www.bing.com/search", {
      params: {
        q: query,
        first: 1 + page * 10,
        mkt: "en-US",
        setlang: "en-US",
        cc: "US",
        ensearch: 1,
      },
      headers,
      timeout: 10000,
    });

    return response.data;
  } catch (error) {
    throw new Error(
      `Bing search failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
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

    const response = await axios.get("https://search.brave.com/search", {
      params: {
        q: query,
        source: "web",
        offset,
      },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        Referer: "https://search.brave.com/",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        DNT: "1",
      },
      timeout: 10000,
    });
    return response.data;
  } catch (error) {
    throw new Error(
      `Brave search failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

function createDuckDuckHeaders(type: "search" | "api"): Record<string, string> {
  if (type !== "search" && type !== "api") {
    throw new Error(`Invalid type: ${type}. Must be "search" or "api".`);
  }

  const base = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36",
    Connection: "keep-alive",
    "Accept-Encoding": "gzip, deflate, br",
    "accept-language": "en-NL,en;q=0.9",
    Referer: "https://duckduckgo.com/",
    "sec-ch-ua":
      '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "cache-control": "no-cache",
    pragma: "no-cache",
    priority: "u=0, i",
    cookie: "ah=us-en; l=us-en",
  };

  switch (type) {
    case "search":
      return {
        ...base,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "upgrade-insecure-requests": "1",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "navigate",
        "sec-fetch-user": "?1",
        "sec-fetch-dest": "document",
      };
    case "api":
      return {
        ...base,
        Accept: "*/*",
        "sec-fetch-site": "same-site",
        "sec-fetch-mode": "no-cors",
        "sec-fetch-dest": "script",
      };
  }
}

/**
 * Fetches content from DuckDuckGo
 * @param url URL to fetch
 * @param headers Request headers
 * @returns HTML content string
 * @throws Error if request fails
 */
async function fetchDuckDuckGo(
  url: string,
  headers: Record<string, string>
): Promise<string> {
  fetchLogs();
  const response = await axios.get(url, { headers });
  return response.data;
}

/**
 * Fetches the initial DuckDuckGo search page
 * @param query search query string
 * @returns HTML content string
 */
async function fetchDuckDuckSearchPage(query: string): Promise<string> {
  return fetchDuckDuckGo(
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}&t=h_&ia=web`,
    createDuckDuckHeaders("search")
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
  offset: number
): Promise<string> {
  // Construct the final API URL with offset
  const apiUrlWithOffset = ((): string => {
    const generatedUrlWithOffset = new URL(apiUrlFromHTML);
    generatedUrlWithOffset.searchParams.set("s", offset.toString());
    return generatedUrlWithOffset.toString();
  })();
  return fetchDuckDuckGo(apiUrlWithOffset, createDuckDuckHeaders("api"));
}

export {
  fetchBingPage,
  fetchBravePage,
  fetchDuckDuckSearchPage,
  fetchDuckDuckApiResults,
};
