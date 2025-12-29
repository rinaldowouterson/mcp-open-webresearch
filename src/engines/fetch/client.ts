import { Impit } from 'impit';
import { loadConfig } from '../../config/index.js';

const config = loadConfig();

// 1. Initialize the browser-like impersonator (mimics Chrome 120+)
const browserClient = new Impit({
  browser: "chrome",
  proxyUrl: config.proxy.enabled && config.proxy.url ? config.proxy.url : undefined,
  ignoreTlsErrors: config.ssl.ignoreTlsErrors,
});

// 2. Initialize the standard client (Dumb HTTP client, no impersonation, but supports proxy)
const standardClient = new Impit({
  // browser: undefined, // Defaults to undefined (no browser emulation)
  proxyUrl: config.proxy.enabled && config.proxy.url ? config.proxy.url : undefined,
  ignoreTlsErrors: config.ssl.ignoreTlsErrors,
});

export interface SmartFetchOptions {
  /**
   * If true, mimics a real Chrome browser (TLS fingerprinting, auto User-Agent). Best for Bing, Brave.
   * If false or undefined, uses a standard HTTP client (no fingerprinting). Best for DuckDuckGo, APIs.
   */
  browserMode?: boolean;
}

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
  const client = useBrowser ? browserClient : standardClient;

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
