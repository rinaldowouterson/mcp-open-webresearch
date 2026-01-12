import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  AppConfig,
  ProxyConfig,
  ProxyProtocol,
  LlmConfig,
} from "../types/index.js";
import { resetClients } from "../infrastructure/fetch/client.js";
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

  if (isValidProtocol) {
    try {
      urlObject = new URL(proxyUrl);
      protocol = urlObject.protocol.replace(":", "") as ProxyProtocol;
      host = urlObject.hostname;
      port = urlObject.port ? parseInt(urlObject.port, 10) : null;
      username = urlObject.username;
      password = urlObject.password;
    } catch (caughtError) {
      console.debug("loader: Failed to parse proxy URL: ", caughtError);
      error = error
        ? error + `\n${caughtError};`
        : `Failed to parse proxy URL: ${caughtError}`;
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
 * Core LLM configuration builder.
 * Extracted to allow reuse in both production (setConfig) and testing (resetConfigForTesting).
 *
 * @param ideSupportsSampling - Whether the IDE supports sampling (from server or mocked)
 */
const buildLlmConfigFromParams = (
  ideSupportsSampling: boolean,
  overrides?: ConfigOverrides,
): LlmConfig => {
  const baseUrl = overrides?.llm?.baseUrl || process.env.LLM_BASE_URL || null;
  const apiKey = overrides?.llm?.apiKey || process.env.LLM_API_KEY || null;
  const model = overrides?.llm?.model || process.env.LLM_NAME || null;
  const apiSamplingAvailable = !!baseUrl && !!model;

  const skipIdeSampling =
    overrides?.llm?.skipIdeSampling ??
    process.env.SKIP_IDE_SAMPLING?.toLowerCase() === "true";

  const samplingEnabled =
    overrides?.sampling ?? process.env.SAMPLING?.toLowerCase() === "true";

  // Logic based on README.md priority table:
  // Sampling is allowed if SAMPLING=true AND (IDE available OR API available)
  const samplingAllowed =
    samplingEnabled &&
    ((ideSupportsSampling && !skipIdeSampling) || apiSamplingAvailable);

  const timeoutMs =
    overrides?.llm?.timeoutMs ||
    parseInt(process.env.LLM_TIMEOUT_MS || "30000", 10);

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
    retryDelays:
      overrides?.llm?.retryDelays ||
      (process.env.LLM_RETRY_DELAYS
        ? process.env.LLM_RETRY_DELAYS.split(",").map((d) => parseInt(d, 10))
        : [5000, 25000, 60000]),
  };
};

/**
 * Builds LLM configuration from environment variables and server capabilities.
 */
/**
 * Builds the application configuration object.
 * Encapsulates logic for parsing environment variables and applying overrides.
 *
 * @param ideSupportsSampling - Whether the IDE handles sampling (determined by server capabilities or test mock)
 * @param overrides - Optional configuration overrides
 */
const buildConfig = (
  ideSupportsSampling: boolean,
  overrides?: ConfigOverrides,
): AppConfig => {
  const defaultSearchEngines =
    overrides?.engines ||
    (process.env.DEFAULT_SEARCH_ENGINES
      ? process.env.DEFAULT_SEARCH_ENGINES.split(",").map((e) => e.trim())
      : ["bing", "duckduckgo", "brave"]);

  const enableCors = overrides?.cors ?? process.env.ENABLE_CORS === "true";

  const isDocker = process.env.DOCKER_ENVIRONMENT === "true";
  const chromiumPath = process.env.CHROMIUM_EXECUTABLE_PATH;

  const logPath =
    overrides?.logPath || process.env.MCP_LOG_PATH || "mcp-debug.log";

  return {
    port:
      overrides?.port ||
      (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000),
    publicUrl:
      overrides?.publicUrl ||
      process.env.PUBLIC_URL ||
      `http://localhost:${
        overrides?.port ||
        (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000)
      }`,
    defaultSearchEngines,
    proxy: loadProxyConfig(overrides),
    enableCors,
    corsOrigin: overrides?.corsOrigin || process.env.CORS_ORIGIN || "*",
    ssl: {
      ignoreTlsErrors:
        overrides?.ssl?.ignoreTlsErrors ??
        process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0",
    },
    docker: {
      isDocker,
      chromiumPath,
    },
    logging: {
      level: "debug",
      path: logPath,
      writeToTerminal:
        overrides?.debug ?? process.env.WRITE_DEBUG_TERMINAL === "true",
      writeToFile:
        !!overrides?.debugFile || process.env.WRITE_DEBUG_FILE === "true",
    },
    llm: buildLlmConfigFromParams(ideSupportsSampling, overrides),
    skipCooldown:
      overrides?.skipCooldown ??
      process.env.SKIP_COOLDOWN?.toLowerCase() === "true",
    deepSearch: {
      maxLoops:
        overrides?.deepSearch?.maxLoops ??
        parseInt(process.env.DEEP_SEARCH_MAX_LOOPS || "20", 10),
      resultsPerEngine:
        overrides?.deepSearch?.resultsPerEngine ??
        parseInt(process.env.DEEP_SEARCH_RESULTS_PER_ENGINE || "5", 10),
      saturationThreshold:
        overrides?.deepSearch?.saturationThreshold ??
        parseFloat(process.env.DEEP_SEARCH_SATURATION_THRESHOLD || "0.6"),
      maxCitationUrls:
        overrides?.deepSearch?.maxCitationUrls ??
        parseInt(process.env.DEEP_SEARCH_MAX_CITATION_URLS || "10", 10),
      reportRetentionMinutes:
        overrides?.deepSearch?.reportRetentionMinutes ??
        parseInt(process.env.DEEP_SEARCH_REPORT_RETENTION_MINUTES || "10", 10),
    },
    browser: {
      concurrency:
        overrides?.browser?.concurrency ??
        parseInt(process.env.BROWSER_CONCURRENCY || "4", 10),
      idleTimeout:
        overrides?.browser?.idleTimeout ??
        parseInt(
          process.env.BROWSER_IDLE_TIMEOUT_MS || String(5 * 60 * 1000),
          10,
        ),
      screenshotMaxSize:
        overrides?.browser?.screenshotMaxSize ??
        parseInt(
          process.env.BROWSER_SCREENSHOT_MAX_SIZE || String(5 * 1024 * 1024),
          10,
        ),
    },
    security: {
      enableDnsRebindingProtection:
        overrides?.security?.enableDnsRebindingProtection ??
        process.env.ENABLE_DNS_REBINDING_PROTECTION === "true",
      allowedHosts:
        overrides?.security?.allowedHosts ??
        (process.env.ALLOWED_HOSTS
          ? process.env.ALLOWED_HOSTS.split(",").map((h) => h.trim())
          : ["127.0.0.1", "localhost"]),
    },
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

  // Ensure fetcher clients are reset when new config is set
  resetClients();

  const ideSupportsSampling = clientSupportsSampling(server);
  const config = buildConfig(ideSupportsSampling, overrides);

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
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "CRITICAL: resetConfigForTesting called in PRODUCTION environment!",
    );
  }

  // Ensure fetcher clients are reset during tests
  resetClients();

  // In testing, we use the hardcoded "3" result limit from the original code if not overridden?
  // Actually, for consistency, we now rely on buildConfig which uses 5.
  // Tests that rely on specific counts should mock the env var.
  // However, to strictly preserve behavior if needed, we could set env var if not set.
  // But let's proceed with unified config.
  appConfig = Object.freeze(buildConfig(ideSupportsSampling, overrides));
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
