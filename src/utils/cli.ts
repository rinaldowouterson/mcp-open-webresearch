import { program } from "commander";
import { type ConfigOverrides } from "../types/ConfigOverrides.js";
import { type LlmConfig } from "../types/index.js";

/**
 * Parses command line arguments into ConfigOverrides.
 * Should be called before any configuration is loaded.
 */
export function parseCliArgs(): ConfigOverrides {
  program
    .option("-p, --port <number>", "Port to listen on")
    .option("-d, --debug", "Enable debug logging to stdout")
    .option("--debug-file", "Enable debug logging to file")
    .option("--log-path <path>", "Path to debug log file")
    .option("--cors", "Enable CORS")
    .option("--cors-origin <url>", "CORS allowed origin")
    .option("--proxy <url>", "Proxy URL (http, https, or socks5)")
    .option(
      "--engines <items>",
      "Comma-separated list of search engines",
      (value) => value.split(","),
    )
    .option("--sampling", "Enable sampling for search results (default)")
    .option("--no-sampling", "Disable sampling for search results")
    .option("--skip-cooldown", "Skip engine throttle cooldowns")
    .option("--ignore-tls", "Ignore SSL/TLS errors")
    // DeepSearch
    .option("--ds-max-loops <n>", "DeepSearch: Max feedback loops", (v) =>
      parseInt(v, 10),
    )
    .option(
      "--ds-results-per-engine <n>",
      "DeepSearch: Results per engine",
      (v) => parseInt(v, 10),
    )
    .option(
      "--ds-saturation <float>",
      "DeepSearch: Saturation threshold",
      (v) => parseFloat(v),
    )
    .option(
      "--ds-max-citations <n>",
      "DeepSearch: Max URLs for citations",
      (v) => parseInt(v, 10),
    )
    .option(
      "--ds-retention <min>",
      "DeepSearch: Report retention in minutes",
      (v) => parseInt(v, 10),
    )
    // Browser
    .option(
      "--browser-concurrency <n>",
      "Browser: Max parallel extractions",
      (v) => parseInt(v, 10),
    )
    .option("--browser-timeout <ms>", "Browser: Idle timeout in ms", (v) =>
      parseInt(v, 10),
    )
    .option(
      "--screenshot-max-size <bytes>",
      "Browser: Max screenshot size in bytes",
      (v) => parseInt(v, 10),
    )
    // LLM
    .option("--llm-base-url <url>", "LLM: Custom API base URL")
    .option("--llm-api-key <key>", "LLM: API key")
    .option("--llm-model <name>", "LLM: Model name")
    .option("--llm-timeout <ms>", "LLM: API timeout in ms", (v) =>
      parseInt(v, 10),
    )
    .option(
      "--retry-delays <ms...>",
      "LLM: Comma-separated retry delays",
      (v) => v.split(",").map((d) => parseInt(d, 10)),
    )
    .option("--skip-ide-sampling", "LLM: Prefer external API over IDE sampling")
    // Security
    .option(
      "--dns-rebinding <bool>",
      "Security: Enable DNS rebinding protection",
      (v) => v === "true",
    )
    .option(
      "--allowed-hosts <hosts>",
      "Security: Comma-separated allowed hosts",
      (v) => v.split(","),
    );

  program.parse();

  const options = program.opts();

  return {
    port: options.port ? parseInt(options.port, 10) : undefined,
    debug: options.debug,
    debugFile: options.debugFile,
    logPath: options.logPath,
    cors: options.cors,
    corsOrigin: options.corsOrigin,
    proxyUrl: options.proxy,
    engines: options.engines,
    sampling: options.sampling,
    skipCooldown: options.skipCooldown,
    deepSearch: {
      maxLoops: options.dsMaxLoops,
      resultsPerEngine: options.dsResultsPerEngine,
      saturationThreshold: options.dsSaturation,
      maxCitationUrls: options.dsMaxCitations,
      reportRetentionMinutes: options.dsRetention,
    },
    browser: {
      concurrency: options.browserConcurrency,
      idleTimeout: options.browserTimeout,
      screenshotMaxSize: options.screenshotMaxSize,
    },
    llm: {
      baseUrl: options.llmBaseUrl,
      apiKey: options.llmApiKey,
      model: options.llmModel,
      timeoutMs: options.llmTimeout,
      retryDelays: options.retryDelays,
      skipIdeSampling: options.skipIdeSampling,
    } as Partial<LlmConfig>,
    security: {
      enableDnsRebindingProtection: options.dnsRebinding,
      allowedHosts: options.allowedHosts,
    },
    ssl: {
      ignoreTlsErrors: options.ignoreTls,
    },
  };
}
