export interface ThrottleConfig {
  /** Milliseconds between separate search queries (e.g., 5000 for Brave) */
  searchCooldown: number;
  /** Milliseconds between pages within one search (e.g., 1000) */
  pageCooldown: number;
}
