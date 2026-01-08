import { Impit } from "impit";
import { getConfig } from "../../config/index.js";
import { SmartFetchOptions } from "../../types/index.js";

// Lazy-initialized clients to avoid calling getConfig() at module scope
let browserClient: Impit | null = null;
let standardClient: Impit | null = null;

/**
 * Gets or creates the browser-like impersonator (mimics Chrome 120+)
 */
const getBrowserClient = (): Impit => {
  if (!browserClient) {
    const config = getConfig();
    browserClient = new Impit({
      browser: "chrome",
      proxyUrl:
        config.proxy.enabled && config.proxy.url ? config.proxy.url : undefined,
      ignoreTlsErrors: config.ssl.ignoreTlsErrors,
    });
  }
  return browserClient;
};

/**
 * Gets or creates the standard client (no browser emulation)
 */
const getStandardClient = (): Impit => {
  if (!standardClient) {
    const config = getConfig();
    standardClient = new Impit({
      proxyUrl:
        config.proxy.enabled && config.proxy.url ? config.proxy.url : undefined,
      ignoreTlsErrors: config.ssl.ignoreTlsErrors,
    });
  }
  return standardClient;
};

/**
 * A unified fetch utility that chooses the best strategy for the target.
 */
export async function smartFetch(url: string, options: SmartFetchOptions = {}) {
  // Default to true (browser mode) if not specified, or allow explicit false.
  // The user prompt implies "browserMode" boolean.
  // I'll assume default is browser-like (true) to be safe for most scrapers,
  // but let's look at usage.
  // Actually, for a "dumb" fetch replacement, maybe false is safer?
  // User said: "instead of resorting to a string value for strategy key, i want the name for the key to be browserMode and a simple boolean"

  const useBrowser = options.browserMode ?? true;
  const client = useBrowser ? getBrowserClient() : getStandardClient();

  // We explicitly DO NOT handle custom headers argument as requested by user.
  // "smartFetch don't need headers, remove that optional flexibility"

  try {
    const response = await client.fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    throw error;
  }
}
