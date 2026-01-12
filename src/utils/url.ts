/**
 * Centralized URL Utilities
 */

/**
 * Normalizes a URL for deduplication and comparison.
 * Strips protocol (http/https), www prefix, and trailing slashes.
 */
export function normalizeUrlForDedup(url: string): string {
  try {
    return url
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/$/, "");
  } catch {
    return url.toLowerCase().trim();
  }
}

/**
 * Extracts the hostname from a URL.
 */
export function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
