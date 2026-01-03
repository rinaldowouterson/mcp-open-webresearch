import { createHash } from "crypto";
import { SearchResult } from "../../types/index.js";
import { MergedSearchResult } from "../../types/MergedSearchResult.js";

/**
 * Generates a stable hash for a URL by stripping protocol and www.
 * This allows matching "http://example.com" with "https://www.example.com".
 */
export function getUrlHash(url: string): string {
  const canonical = url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, ""); // Remove trailing slash
  return createHash("sha256").update(canonical).digest("hex").substring(0, 16);
}

/**
 * Merges search results from multiple engines into a deduplicated, ranked list.
 *
 * Philosophy:
 * - Each engine's results are treated as "votes" for a URL.
 * - A URL found by multiple engines gets a higher score.
 * - Original rank positions are inverted (1/rank) and summed to remove bias
 *   (e.g., rank 1 from Bing + rank 3 from Brave = 1/1 + 1/3 = 1.33).
 * - The final score is multiplied by the number of engines for consensus boost.
 */
export function mergeSearchResults(
  results: SearchResult[],
): MergedSearchResult[] {
  const hashMap = new Map<
    string,
    {
      url: string;
      titles: string[];
      descriptions: string[];
      engines: string[];
      ranks: number[];
    }
  >();

  // Group results by URL hash
  results.forEach((result, index) => {
    const hash = getUrlHash(result.url);
    const existing = hashMap.get(hash);

    if (existing) {
      existing.titles.push(result.title);
      existing.descriptions.push(result.description);
      if (!existing.engines.includes(result.engine)) {
        existing.engines.push(result.engine);
      }
      existing.ranks.push(index + 1); // 1-indexed rank within the flat list
    } else {
      hashMap.set(hash, {
        url: result.url,
        titles: [result.title],
        descriptions: [result.description],
        engines: [result.engine],
        ranks: [index + 1],
      });
    }
  });

  // Convert to MergedSearchResult with scores
  const merged: MergedSearchResult[] = [];

  for (const [hash, data] of hashMap.entries()) {
    // Heuristic champion: longest title and description
    const bestTitle = data.titles.reduce((a, b) =>
      a.length >= b.length ? a : b,
    );
    const bestDescription = data.descriptions.reduce((a, b) =>
      a.length >= b.length ? a : b,
    );

    // Base score: sum of inverted ranks (1/rank)
    // This rewards results that appear higher in individual engine results
    const baseScore = data.ranks.reduce((sum, rank) => sum + 1 / rank, 0);

    // Consensus multiplier: more engines = higher confidence
    const consensusMultiplier = data.engines.length;

    const consensusScore = baseScore * consensusMultiplier;

    merged.push({
      urlHash: hash,
      url: data.url,
      title: bestTitle,
      description: bestDescription,
      engines: data.engines,
      ranks: data.ranks,
      consensusScore,
    });
  }

  // Sort by consensus score (descending)
  merged.sort((a, b) => b.consensusScore - a.consensusScore);

  console.debug(
    `[SignalProcessor] Merged ${results.length} results into ${merged.length} unique URLs.`,
  );

  return merged;
}
