export interface SmartFetchOptions {
  /**
   * If true, mimics a real Chrome browser (TLS fingerprinting, auto User-Agent). Best for Bing, Brave.
   * If false or undefined, uses a standard HTTP client (no fingerprinting). Best for DuckDuckGo, APIs.
   */
  browserMode?: boolean;
}
