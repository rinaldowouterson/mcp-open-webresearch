/**
 * Centralized throttle management for search engines.
 *
 * Engines configure their throttle settings at startup.
 * The registry and executeMultiEngineSearch use isThrottled() to skip busy engines.
 * Engines call cooldown() between pages and touch() after each fetch.
 */

import { ThrottleConfig } from "../../types/ThrottleConfig.js";

// Module state
const configs = new Map<string, ThrottleConfig>();
const lastUsed = new Map<string, number>();

const defaultConfig: ThrottleConfig = { searchCooldown: 0, pageCooldown: 0 };

/**
 * Configure throttle settings for an engine.
 * Call this in each engine's index.ts at module load time.
 */
export function setThrottle(engine: string, config: ThrottleConfig): void {
  configs.set(engine, config);
}

/**
 * Check if an engine is currently throttled.
 * Returns true if searchCooldown hasn't elapsed since last use.
 */
export function isThrottled(engine: string): boolean {
  const config = configs.get(engine) ?? defaultConfig;
  if (config.searchCooldown === 0) return false;

  const last = lastUsed.get(engine) ?? 0;
  return Date.now() - last < config.searchCooldown;
}

/**
 * Wait for page cooldown if needed.
 * Call this between pagination requests within a search.
 */
export async function cooldown(engine: string): Promise<void> {
  const config = configs.get(engine) ?? defaultConfig;
  if (config.pageCooldown === 0) return;

  const last = lastUsed.get(engine) ?? 0;
  const elapsed = Date.now() - last;
  const delay = config.pageCooldown - elapsed;

  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

/**
 * Mark an engine as just used.
 * Call this after each fetch (both initial and pagination).
 */
export function touch(engine: string): void {
  lastUsed.set(engine, Date.now());
}

/**
 * Get time until engine is available (for logging/debugging).
 * Returns 0 if not throttled.
 */
export function throttleTimeRemaining(engine: string): number {
  const config = configs.get(engine) ?? defaultConfig;
  if (config.searchCooldown === 0) return 0;

  const last = lastUsed.get(engine) ?? 0;
  const remaining = config.searchCooldown - (Date.now() - last);
  return Math.max(0, remaining);
}

/**
 * Reset all throttle state. Use in tests.
 */
export function resetThrottle(): void {
  lastUsed.clear();
}

/**
 * Clear all configs and state. Use in tests.
 */
export function clearThrottle(): void {
  configs.clear();
  lastUsed.clear();
}
