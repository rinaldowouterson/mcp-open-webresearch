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
 * Module-level singleton for application configuration.
 * Initialized once via setConfig(server, overrides) during startup.
 */
let appConfig: Readonly<AppConfig> | null = null;

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
 * Called once during setConfig to determine IDE availability.
 */
const clientSupportsSampling = (server: McpServer): boolean => {
  const capabilities = server.server.getClientCapabilities();
  return !!capabilities?.sampling;
};

/**
 * Builds LLM configuration from environment variables and server capabilities.
 */
const buildLlmConfig = (server: McpServer): LlmConfig => {
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

  const ideSelectedButApiAvailable =
    samplingEnabled &&
    !ideSupportsSampling &&
    !skipIdeSampling &&
    apiSamplingAvailable;

  const apiSelectedButIdeAvailable =
    samplingEnabled &&
    ideSupportsSampling &&
    skipIdeSampling &&
    !apiSamplingAvailable;

  // Primary strategy flags
  const useApiFirst = skipIdeSampling && apiSamplingAvailable;
  const useIdeFirst = !skipIdeSampling && ideSupportsSampling;

  return {
    samplingAllowed,
    baseUrl,
    apiKey,
    model,
    timeoutMs,
    skipIdeSampling,
    apiSamplingAvailable,
    ideSupportsSampling,
    ideSelectedButApiAvailable,
    apiSelectedButIdeAvailable,
    useApiFirst,
    useIdeFirst,
  };
};

/**
 * Initializes application configuration. Must be called once during server startup.
 * Reads environment variables, applies overrides, and stores the frozen config singleton.
 * @returns The frozen application configuration.
 */
export const setConfig = (
  server: McpServer,
  overrides?: ConfigOverrides,
): Readonly<AppConfig> => {
  if (appConfig) {
    console.debug("setConfig called multiple times. Using existing config.");
    return appConfig;
  }

  const defaultSearchEngines =
    overrides?.engines ||
    (process.env.DEFAULT_SEARCH_ENGINES
      ? process.env.DEFAULT_SEARCH_ENGINES.split(",").map((e) => e.trim())
      : ["bing", "duckduckgo", "brave"]);

  const enableCors = overrides?.cors ?? process.env.ENABLE_CORS === "true";

  const isDocker = process.env.DOCKER_ENVIRONMENT === "true";
  const chromiumPath = process.env.CHROMIUM_EXECUTABLE_PATH;

  // Logging
  const logPath = process.env.MCP_LOG_PATH || "mcp-debug.log"; // Default filename
  // The absolute path resolution happens in logger if needed, or here.
  // We'll pass the raw string and let logger resolve it or resolve it here if we want strictness.
  // Best to resolve it in logger or keep it as is, but we must be consistent.
  // The existing logger used: process.env.MCP_LOG_PATH || path.resolve(process.cwd(), "mcp-debug.log")
  // We will replicate that logic there or pass it in. Let's pass the raw value from env/override.

  const config: AppConfig = {
    port:
      overrides?.port ||
      (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000),
    defaultSearchEngines,
    proxy: loadProxyConfig(overrides),
    enableCors,
    corsOrigin: process.env.CORS_ORIGIN || "*",
    ssl: {
      ignoreTlsErrors: process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0",
    },
    docker: {
      isDocker,
      chromiumPath,
    },
    logging: {
      level: "debug", // Fixed for now as we only have debug
      path: logPath,
      writeToTerminal:
        overrides?.debug ?? process.env.WRITE_DEBUG_TERMINAL === "true",
      writeToFile:
        !!overrides?.debugFile || process.env.WRITE_DEBUG_FILE === "true",
    },
    llm: buildLlmConfig(server),
    skipCooldown: process.env.SKIP_COOLDOWN?.toLowerCase() === "true",
    deepSearch: {
      maxLoops: parseInt(process.env.DEEP_SEARCH_MAX_LOOPS || "3", 10),
      resultsPerEngine: parseInt(
        process.env.DEEP_SEARCH_RESULTS_PER_ENGINE || "3",
        10,
      ),
      saturationThreshold: parseFloat(
        process.env.DEEP_SEARCH_SATURATION_THRESHOLD || "0.6",
      ),
      maxCitationUrls: parseInt(
        process.env.DEEP_SEARCH_MAX_CITATION_URLS || "10",
        10,
      ),
    },
  };

  appConfig = Object.freeze(config);
  return appConfig;
};

/**
 * Returns the cached application configuration.
 * Throws an error if setConfig() has not been called during startup.
 */
export const getConfig = (): Readonly<AppConfig> => {
  if (!appConfig) {
    throw new Error(
      "Config not initialized. Call setConfig(server, overrides) first during startup.",
    );
  }
  return appConfig;
};

/**
 * TEST ONLY: Resets the config singleton for unit testing.
 * Allows tests to initialize config based on env vars without a real server.
 * @param ideSupportsSampling - Mocked IDE sampling capability (default: false)
 * @param overrides - Optional ConfigOverrides to apply
 */
export const resetConfigForTesting = (
  ideSupportsSampling = false,
  overrides?: ConfigOverrides,
): void => {
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

  const defaultSearchEngines =
    overrides?.engines ||
    (process.env.DEFAULT_SEARCH_ENGINES
      ? process.env.DEFAULT_SEARCH_ENGINES.split(",").map((e) => e.trim())
      : ["bing", "duckduckgo", "brave"]);

  const enableCors = overrides?.cors ?? process.env.ENABLE_CORS === "true";

  appConfig = Object.freeze({
    port:
      overrides?.port ||
      (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000),
    defaultSearchEngines,
    proxy: loadProxyConfig(overrides),
    enableCors,
    corsOrigin: process.env.CORS_ORIGIN || "*",
    ssl: {
      ignoreTlsErrors: process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0",
    },
    docker: {
      isDocker: process.env.DOCKER_ENVIRONMENT === "true",
      chromiumPath: process.env.CHROMIUM_EXECUTABLE_PATH,
    },
    logging: {
      level: "debug",
      path: process.env.MCP_LOG_PATH || "mcp-debug.log",
      writeToTerminal:
        overrides?.debug ?? process.env.WRITE_DEBUG_TERMINAL === "true",
      writeToFile:
        !!overrides?.debugFile || process.env.WRITE_DEBUG_FILE === "true",
    },
    llm: {
      samplingAllowed,
      baseUrl,
      apiKey,
      model,
      timeoutMs,
      skipIdeSampling,
      apiSamplingAvailable,
      ideSupportsSampling,
      ideSelectedButApiAvailable:
        samplingEnabled &&
        !ideSupportsSampling &&
        !skipIdeSampling &&
        apiSamplingAvailable,
      apiSelectedButIdeAvailable:
        samplingEnabled &&
        ideSupportsSampling &&
        skipIdeSampling &&
        !apiSamplingAvailable,
      useApiFirst: skipIdeSampling && apiSamplingAvailable,
      useIdeFirst: !skipIdeSampling && ideSupportsSampling,
    },
    skipCooldown: process.env.SKIP_COOLDOWN?.toLowerCase() === "true",
    deepSearch: {
      maxLoops: parseInt(process.env.DEEP_SEARCH_MAX_LOOPS || "3", 10),
      resultsPerEngine: parseInt(
        process.env.DEEP_SEARCH_RESULTS_PER_ENGINE || "3",
        10,
      ),
      saturationThreshold: parseFloat(
        process.env.DEEP_SEARCH_SATURATION_THRESHOLD || "0.6",
      ),
      maxCitationUrls: parseInt(
        process.env.DEEP_SEARCH_MAX_CITATION_URLS || "10",
        10,
      ),
    },
  });
};

/**
 * Updates the configurations default search engines at runtime
 */
export const updateDefaultSearchEngines = (engines: string[]): void => {
  if (!appConfig) return;
  const newConfig = { ...appConfig, defaultSearchEngines: [...engines] };
  appConfig = Object.freeze(newConfig);
  console.debug(
    `Runtime config updated: defaultSearchEngines=${engines.join(",")}`,
  );
};

/**
 * Updates the sampling configuration at runtime.
 * Recalculates samplingAllowed based on existing capabilities.
 */
export const updateSamplingConfig = (enabled: boolean): void => {
  if (!appConfig) return;

  const { ideSupportsSampling, skipIdeSampling, apiSamplingAvailable } =
    appConfig.llm;

  const samplingAllowed =
    enabled &&
    ((ideSupportsSampling && !skipIdeSampling) || apiSamplingAvailable);

  const newLlmConfig: LlmConfig = {
    ...appConfig.llm,
    samplingAllowed,
  };

  const newConfig = { ...appConfig, llm: newLlmConfig };

  appConfig = Object.freeze(newConfig);
  console.debug(
    `Runtime config updated: sampling=${enabled}, allowed=${samplingAllowed}`,
  );
};
