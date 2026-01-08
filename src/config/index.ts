import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  AppConfig,
  ProxyConfig,
  ProxyProtocol,
  ProxyAgent,
  LlmConfig,
} from "../types/index.js";
import { ConfigOverrides } from "../types/index.js";

/**
 * Module-level singleton for LLM configuration.
 * Initialized once via setLLMConfig(server) during startup.
 */
let llmConfig: LlmConfig | null = null;

const supportedProtocolPatterns = /^(https?|socks5):\/\//i;

export const validProtocolPattern = (url: string): boolean => {
  const emptyUrl = url.trim().length === 0;
  const urlStartsWithProtocol = supportedProtocolPatterns.test(url);
  return !emptyUrl && urlStartsWithProtocol;
};

const loadProxyConfig = (overrides?: ConfigOverrides): ProxyConfig => {
  // If proxyUrl is provided via CLI, use it. Otherwise fall back to Env Vars.
  let proxyUrl = overrides?.proxyUrl;
  let enableProxy = !!proxyUrl;

  if (!proxyUrl) {
    // Fallback to Env Vars
    proxyUrl =
      process.env.SOCKS5_PROXY ||
      process.env.HTTPS_PROXY ||
      process.env.HTTP_PROXY ||
      "";
    enableProxy = process.env.ENABLE_PROXY === "true";
  }

  const isValidProtocol = validProtocolPattern(proxyUrl);

  let urlObject: URL;
  let protocol: ProxyProtocol = null;

  // Logic:
  // 1. If overrides.proxyUrl is set, we assume the user WANTS to use proxy (enabled=true).
  // 2. If no override, we check process.env.ENABLE_PROXY.

  // Error handling
  let error: string | null = null;

  if (enableProxy && !isValidProtocol) {
    error = `Invalid proxy URL or protocol. Expected protocol: ${
      supportedProtocolPatterns.source
    } Received: ${proxyUrl === "" ? "empty string" : proxyUrl}`;
    console.debug(`loader: ${error ? `error detected: ${error}` : `no error`}`);
  }

  let host: string | null = null;
  let port: number | null = null;

  let username: string | null = null;
  let password: string | null = null;

  let agent: ProxyAgent | null = null;

  if (isValidProtocol) {
    try {
      urlObject = new URL(proxyUrl);
      protocol = urlObject.protocol.replace(":", "") as ProxyProtocol;
      host = urlObject.hostname;
      port = urlObject.port ? parseInt(urlObject.port, 10) : null;
      username = urlObject.username;
      password = urlObject.password;

      if (protocol && protocol.includes("socks")) {
        agent = {
          http: new SocksProxyAgent(urlObject),
          https: new SocksProxyAgent(urlObject),
        };
      } else {
        agent = {
          http: new HttpsProxyAgent(urlObject),
          https: new HttpsProxyAgent(urlObject),
        };
      }
    } catch (caughtError) {
      console.debug("loader: Failed to create proxy agent: ", caughtError);
      error = error
        ? error + `\n${caughtError};`
        : `Failed to create proxy agent: ${caughtError}`;
    }
  }

  return {
    url: proxyUrl,
    enabled: enableProxy,
    isValid: isValidProtocol,
    protocol,
    error,
    host,
    port,
    username,
    password,
  };
};

/**
 * Check if the MCP client supports LLM sampling capability.
 * Called once during setLLMConfig to determine IDE availability.
 */
const clientSupportsSampling = (server: McpServer): boolean => {
  const capabilities = server.server.getClientCapabilities();
  return !!capabilities?.sampling;
};

/**
 * Initializes LLM configuration. Must be called once during server startup.
 * Reads environment variables, checks server capabilities, and computes
 * samplingAllowed based on README.md priority table.
 */
export const setLLMConfig = (server: McpServer): void => {
  const baseUrl = process.env.LLM_BASE_URL || null;
  const apiKey = process.env.LLM_API_KEY || null;
  const model = process.env.LLM_NAME || null;
  const apiSamplingAvailable = !!baseUrl && !!model;

  const skipIdeSampling =
    process.env.SKIP_IDE_SAMPLING?.toLowerCase() === "true";
  const ideSupportsSampling = clientSupportsSampling(server);
  const samplingEnabled = process.env.SAMPLING?.toLowerCase() === "true";

  // Logic based on README.md priority table:
  // Sampling is allowed if SAMPLING=true AND (IDE available OR API available)
  const samplingAllowed =
    samplingEnabled &&
    ((ideSupportsSampling && !skipIdeSampling) || apiSamplingAvailable);

  const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS || "30000", 10);

  if (samplingEnabled && !ideSupportsSampling && !apiSamplingAvailable) {
    console.debug(
      "Sampling is enabled but IDE does not support sampling and no API sampling is available.",
    );
    console.debug(
      "Sampling is disabled until a valid LLM base url and model are set.",
    );
  }

  llmConfig = {
    samplingAllowed,
    baseUrl,
    apiKey,
    model,
    timeoutMs,
    skipIdeSampling,
    apiSamplingAvailable,
    ideSupportsSampling,
  };
};

/**
 * Returns the cached LLM configuration.
 * Throws an error if setLLMConfig() has not been called during startup.
 */
const loadLlmConfig = (): LlmConfig => {
  if (!llmConfig) {
    throw new Error(
      "LLM config not initialized. Call setLLMConfig(server) first during startup.",
    );
  }
  return llmConfig;
};

/**
 * TEST ONLY: Resets the LLM config singleton for unit testing.
 * Allows tests to initialize config based on env vars without a real server.
 * @param ideSupportsSampling - Mocked IDE sampling capability (default: false)
 */
export const resetLLMConfigForTesting = (ideSupportsSampling = false): void => {
  const baseUrl = process.env.LLM_BASE_URL || null;
  const apiKey = process.env.LLM_API_KEY || null;
  const model = process.env.LLM_NAME || null;
  const apiSamplingAvailable = !!baseUrl && !!model;

  const skipIdeSampling =
    process.env.SKIP_IDE_SAMPLING?.toLowerCase() === "true";
  const samplingEnabled = process.env.SAMPLING?.toLowerCase() === "true";

  const samplingAllowed =
    samplingEnabled &&
    ((ideSupportsSampling && !skipIdeSampling) || apiSamplingAvailable);

  const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS || "30000", 10);

  if (samplingEnabled && !ideSupportsSampling && !apiSamplingAvailable) {
    console.debug(
      "Sampling is enabled but IDE does not support sampling and no API sampling is available.",
    );
    console.debug(
      "Sampling is disabled until a valid LLM base url and model are set.",
    );
  }

  llmConfig = {
    samplingAllowed,
    baseUrl,
    apiKey,
    model,
    timeoutMs,
    skipIdeSampling,
    apiSamplingAvailable,
    ideSupportsSampling,
  };
};

export const loadConfig = (
  overrides?: ConfigOverrides,
): Readonly<AppConfig> => {
  // Engine validation happens at runtime via registry - just parse the config here
  const defaultSearchEngines =
    overrides?.engines ||
    (process.env.DEFAULT_SEARCH_ENGINES
      ? process.env.DEFAULT_SEARCH_ENGINES.split(",").map((e) => e.trim())
      : ["bing", "duckduckgo", "brave"]);

  const enableCors = overrides?.cors ?? process.env.ENABLE_CORS === "true";

  const config: AppConfig = {
    defaultSearchEngines,
    proxy: loadProxyConfig(overrides),
    enableCors,
    corsOrigin: process.env.CORS_ORIGIN || "*",
    ssl: {
      ignoreTlsErrors: process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0",
    },
    llm: loadLlmConfig(),
  };

  return Object.freeze(config);
};
