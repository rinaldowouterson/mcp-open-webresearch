export type ProxyProtocol = "http" | "https" | "socks5" | null;

export interface ProxyConfig {
  url: string | null;
  enabled: boolean;
  isValid: boolean;
  protocol: ProxyProtocol;
  error: string | null;
  host: string | null;
  port: number | null;
  username?: string | null;
  password?: string | null;
}

/**
 * LLM configuration for sampling/relevance filtering.
 * `isAvailable` is computed: true if baseUrl AND model are set.
 * apiKey is optional (local LLMs like Ollama don't need it).
 */
export interface LlmConfig {
  /** Whether environment allows LLM sampling */
  samplingAllowed: boolean;
  /** Base URL for the OpenAI-compatible API (LLM_BASE_URL) */
  baseUrl: string | null;
  /** API key for authentication (LLM_API_KEY, optional for local models) */
  apiKey: string | null;
  /** Model name to use (LLM_NAME, required for LLM calls) */
  model: string | null;
  /** Timeout in milliseconds for LLM API calls (LLM_TIMEOUT_MS, default: 30000) */
  timeoutMs: number;
  /** Skip IDE sampling and prefer external API (SKIP_IDE_SAMPLING) */
  skipIdeSampling: boolean;
  /** Whether external API sampling is available */
  apiSamplingAvailable: boolean;
  /** IDE supports LLM sampling */
  ideSupportsSampling: boolean;
  /** Sampling was enabled but IDE does not support sampling and no API sampling is available */
  ideSelectedButApiAvailable: boolean;
  /** Sampling was enabled but API sampling is not available and IDE supports sampling */
  apiSelectedButIdeAvailable: boolean;
  /** Primary strategy: use API first (skipIdeSampling=true && apiSamplingAvailable=true) */
  useApiFirst: boolean;
  /** Primary strategy: use IDE first (default when IDE is available) */
  useIdeFirst: boolean;
}

export interface DeepSearchConfig {
  maxLoops: number;
  resultsPerEngine: number;
  saturationThreshold: number;
  /** Max URLs to visit for citation extraction (-1 = no limit) */
  maxCitationUrls: number;
  /** Report retention time in minutes (default: 10) */
  reportRetentionMinutes: number;
}

export interface AppConfig {
  // Server port
  port: number;

  // Public URL for download links (e.g. http://localhost:3000 or https://my-server.com)
  publicUrl: string;

  // Search engine configuration (array of engine names to use by default)
  defaultSearchEngines: string[];

  // Proxy configuration
  proxy: ProxyConfig;

  // Docker / Browser Ops
  docker: {
    isDocker: boolean;
    chromiumPath: string | undefined;
  };

  // Logging
  logging: {
    level: string; // implied by flags
    path: string;
    writeToTerminal: boolean;
    writeToFile: boolean;
  };

  // CORS configuration
  enableCors: boolean;
  corsOrigin: string;
  // SSL/TLS configuration
  ssl: {
    ignoreTlsErrors: boolean;
  };

  // LLM configuration for sampling
  llm: LlmConfig;

  // Skip engine throttle cooldowns during search
  skipCooldown: boolean;

  // Deep Search Configuration
  deepSearch: DeepSearchConfig;
}
