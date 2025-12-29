import { Impit } from 'impit';
import { loadConfig } from '../../config/index.js';

const config = loadConfig();

// 1. Initialize the impersonator (mimics Chrome 120+)
const impit = new Impit({
  browser: "chrome",
  proxyUrl: config.proxy.enabled && config.proxy.url ? config.proxy.url : undefined,
  ignoreTlsErrors: config.ssl.ignoreTlsErrors,
});

/**
 * A lightweight replacement for axios that bypasses TLS fingerprinting
 */
export async function browserFetch(url: string) {
  try {
    const response = await impit.fetch(url, {
      headers: {
        // Your real browser headers (User-Agent is handled automatically by impit!)
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    // 2. Return data in a format compatible with your existing engine
    return await response.text();

  } catch (error) {
    console.error("Impersonator failed:", error);
    throw error;
  }
}
