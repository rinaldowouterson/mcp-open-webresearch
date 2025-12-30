export interface SearchResult {
  title: string;
  url: string;
  description: string;
  source: string;
  engine: string;
}

/**
 * Function signature for search operations.
 */
export type SearchFn = (query: string, limit: number) => Promise<SearchResult[]>;

/**
 * Contract that each search engine must satisfy.
 * Engines export an `engine` object matching this interface.
 */
export interface SearchEngine {
  /** Unique engine identifier (e.g., "bing", "brave") */
  name: string;
  /** The search function */
  search: SearchFn;
  /** Returns true if the engine is currently rate-limited */
  isRateLimited: () => boolean;
}
