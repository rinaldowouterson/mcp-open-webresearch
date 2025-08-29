const BROWSER_PROTOCOL_PATTERN = /^https?:$/i;

export function isValidBrowserUrl(url: string): boolean {
  if (url.trim().length === 0) return false;
  try {
    const testUrl = new URL(url);
    return BROWSER_PROTOCOL_PATTERN.test(testUrl.protocol);
  } catch {
    return false;
  }
}
