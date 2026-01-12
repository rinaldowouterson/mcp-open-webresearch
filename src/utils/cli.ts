import { program } from "commander";
import { type ConfigOverrides } from "../types/ConfigOverrides.js";

/**
 * Parses command line arguments into ConfigOverrides.
 * Should be called before any configuration is loaded.
 */
export function parseCliArgs(): ConfigOverrides {
  program
    .option("-p, --port <number>", "Port to listen on")
    .option("-d, --debug", "Enable debug logging to stdout")
    .option("--debug-file", "Enable debug logging to file")
    .option("--cors", "Enable CORS")
    .option("--proxy <url>", "Proxy URL")
    .option(
      "--engines <items>",
      "Comma-separated list of search engines",
      (value) => value.split(","),
    )
    .option("--sampling", "Enable sampling for search results (default)")
    .option("--no-sampling", "Disable sampling for search results");

  program.parse();

  const options = program.opts();

  return {
    port: options.port ? parseInt(options.port, 10) : undefined,
    debug: options.debug,
    debugFile: options.debugFile,
    cors: options.cors,
    proxyUrl: options.proxy,
    engines: options.engines,
    sampling: options.sampling,
  };
}
