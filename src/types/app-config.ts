import type { HttpsProxyAgent } from "https-proxy-agent";
import type { SocksProxyAgent } from "socks-proxy-agent";

export type ProxyProtocol = "http" | "https" | "socks5" | null;

export type ProxyAgent = {
  http: HttpsProxyAgent<string> | SocksProxyAgent;
  https: HttpsProxyAgent<string> | SocksProxyAgent;
} | null;

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
}

export interface DeepSearchConfig {
  maxLoops: number;
  resultsPerEngine: number;
  saturationThreshold: number;
}

export interface AppConfig {
  // Server port
  port: number;

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

  // Deep Search Configuration
  deepSearch: DeepSearchConfig;
}
