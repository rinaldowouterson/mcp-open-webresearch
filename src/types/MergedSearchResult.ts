/**
 * A merged result combining signals from potentially multiple engines.
 */

export interface MergedSearchResult {
  /** Stable hash of the canonical URL */
  urlHash: string;
  /** The canonical URL (cleaned) */
  url: string;
  /** Best title (longest among duplicates) */
  title: string;
  /** Best description (longest among duplicates) */
  description: string;
  /** All engines that found this result */
  engines: string[];
  /** Original rank positions from each engine (lower is better) */
  ranks: number[];
  /** Consensus score: higher = more engines agree + better ranks */
  consensusScore: number;
}
