// Supported search engines
export const SUPPORTED_ENGINES = ["bing", "duckduckgo", "brave"] as const;
export type SupportedEngine = (typeof SUPPORTED_ENGINES)[number];
