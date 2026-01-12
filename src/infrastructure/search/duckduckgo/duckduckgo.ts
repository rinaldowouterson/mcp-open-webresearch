import * as cheerio from "cheerio";
import { SearchResult } from "../../../types/search.js";
import {
  fetchDuckDuckApiResults,
  fetchDuckDuckSearchPage,
} from "../../fetch/index.js";

const rawApiToJson = (data: string): any[] | null => {
  const match = data.match(/DDG\.pageLayout\.load\('d',\s*(\[.*?\])\s*\);/s);
  if (!match?.[1]) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
};

const rawJsonToSearchResultType = (item: any): SearchResult => ({
  title: item.t || "",
  url: item.u || "",
  description: item.a || "",
  engine: "duckduckgo",
});

const extractDuckDuckApiUrlFromHTML = (html: string): string | null => {
  const $ = cheerio.load(html);

  const fromPreload = $('link[rel="preload"]')
    .toArray()
    .find((el) => $(el).attr("href")?.includes("links.duckduckgo.com/d.js"));
  if (fromPreload) {
    const href = $(fromPreload).attr("href");
    return href || null;
  }

  const fromScript = $("#deep_preload_script").attr("src");
  if (fromScript?.includes("links.duckduckgo.com/d.js")) return fromScript;

  const match = html.match(/https:\/\/links\.duckduckgo\.com\/d\.js\?[^"']+/i);
  return match ? match[0] : null;
};

const searchDuckDuckGo = async (
  query: string,
  limit: number,
): Promise<SearchResult[]> => {
  const allSearchResults: SearchResult[] = [];
  let offset = 0;
  let iteration = 0;

  const html = await fetchDuckDuckSearchPage(query);

  const apiUrlFromHTML = extractDuckDuckApiUrlFromHTML(html);
  if (!apiUrlFromHTML) return allSearchResults;

  while (allSearchResults.length < limit && offset < limit * 10) {
    const rawApiData = await fetchDuckDuckApiResults(apiUrlFromHTML, offset);

    const rawJsonFromApi = rawApiToJson(rawApiData);

    if (!rawJsonFromApi?.length) break;

    const validatedResults: SearchResult[] = rawJsonFromApi
      .filter((rawJSON) => !rawJSON.n)
      .map(rawJsonToSearchResultType)
      .filter(
        (result) =>
          result.url.length > 0 &&
          result.description.length > 0 &&
          result.title.length > 0,
      )
      .slice(0, limit - allSearchResults.length);

    if (validatedResults.length === 0) break;

    allSearchResults.push(...validatedResults);
    offset += rawJsonFromApi.length;
    iteration++;
  }

  return allSearchResults;
};

export { searchDuckDuckGo };
