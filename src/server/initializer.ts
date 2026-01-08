import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { visitPage } from "../engines/visit_page/visit.js";
import { z } from "zod";
import { loadConfig } from "../config/index.js";
import { getEngineNames } from "../engines/search/registry.js";
import { executeMultiEngineSearch } from "./helpers/executeMultiEngineSearch.js";
import { updateDefaultSearchEngines } from "./helpers/updateDefaultSearchEngines.js";
import { updateSampling } from "./helpers/updateSampling.js";
import { getSampling, getSamplingResponse } from "./helpers/getSampling.js";
import { filterResultsWithSampling } from "./helpers/filterResultsWithSampling.js";
import { createResponse } from "./helpers/createResponse.js";

// Cache for available engine names (populated at startup)
let availableEngines: string[] = [];

/**
 * Initialize the engine registry cache. Call before registering tools.
 */
export const initEngineRegistry = async (): Promise<void> => {
  availableEngines = await getEngineNames();
  console.debug(`Available engines: ${availableEngines.join(", ")}`);
};

export const serverInitializer = (mcpServer: McpServer): void => {
  // Tool: Update default search engines
  mcpServer.registerTool(
    "set_engines",
    {
      description: "Update default search engines and persist to .env",
      inputSchema: {
        engines: z
          .array(z.string())
          .min(1)
          .refine(
            (arr) => arr.every((e) => availableEngines.includes(e)),
            `Invalid engine. Available: ${availableEngines.join(", ")}`,
          )
          .describe(
            `List of search engines to set as default. Available: ${availableEngines.join(
              ", ",
            )}`,
          ),
      },
    },
    async ({ engines }) => {
      return await updateDefaultSearchEngines(engines);
    },
  );

  // Tool: Get current engines
  mcpServer.registerTool(
    "get_engines",
    {
      description: "Check currently configured default search engines",
      inputSchema: {},
    },
    async () => {
      return createResponse(
        JSON.stringify(
          { defaultEngines: loadConfig().defaultSearchEngines },
          null,
          2,
        ),
      );
    },
  );

  // Tool: Set sampling
  mcpServer.registerTool(
    "set_sampling",
    {
      description:
        "Enable or disable LLM-based relevance filtering for search results. When enabled, an LLM evaluates each result for relevance to the query. Requires either: (1) IDE/client with sampling support, OR (2) LLM_BASE_URL set (LLM_API_KEY optional for local models). Persists setting to .env",
      inputSchema: {
        enabled: z
          .boolean()
          .describe("Whether to enable sampling for search results"),
      },
    },
    async ({ enabled }) => {
      return await updateSampling(enabled);
    },
  );

  // Tool: Get sampling status
  mcpServer.registerTool(
    "get_sampling",
    {
      description:
        "Check whether LLM sampling is currently enabled. When enabled, results are filtered by relevance using an LLM. Disabled by default.",
      inputSchema: {},
    },
    async () => {
      return getSamplingResponse();
    },
  );

  // Tool: Web search
  mcpServer.registerTool(
    "search_web",
    {
      description:
        "Search the web using multiple engines. When sampling is enabled, results are filtered using the client's LLM to remove irrelevant content.",
      inputSchema: {
        query: z
          .string()
          .min(1, "Search query must not be empty")
          .describe("Search query string"),
        max_results: z
          .number()
          .min(1)
          .max(50)
          .default(10)
          .describe(
            "Maximum number of results to return PER ENGINE. Default is 10. Max is 50. Total results is the sum of all engines' results.",
          ),
        engines: z
          .array(z.string())
          .min(1)
          .optional()
          .describe(
            `Engines to use. Available: ${availableEngines.join(", ")}`,
          ),
        sampling: z
          .boolean()
          .optional()
          .describe(
            "Override global sampling setting. When true, filters results using the client's LLM. Defaults to global setting.",
          ),
      },
    },
    async ({ query, max_results = 10, engines, sampling }) => {
      try {
        // Use provided engines or fall back to configured defaults
        const enginesToUse = engines?.length
          ? engines
          : loadConfig().defaultSearchEngines;

        // Execute the search
        let results = await executeMultiEngineSearch(
          query,
          enginesToUse,
          max_results,
        );

        // Determine if sampling should be applied
        // Parameter overrides global setting if provided
        const shouldSample = sampling !== undefined ? sampling : getSampling();
        console.debug(
          `Search: Global sampling=${getSampling()}, Request override=${sampling}, Effective=${shouldSample}`,
        );

        // Apply sampling filter if enabled
        if (shouldSample && results.length > 0) {
          console.debug(
            `Search: invoking sampling filter on ${results.length} results...`,
          );
          results = await filterResultsWithSampling({
            query: query.trim(),
            results,
            maxResults: max_results,
            server: mcpServer,
          });
          console.debug(
            `Search: sampling complete. Returning ${results.length} results.`,
          );
        } else if (shouldSample && results.length === 0) {
          console.debug(
            "Search: verification enabled but no results to sample.",
          );
        } else {
          console.debug("Search: sampling disabled, returning raw results.");
        }

        return createResponse(
          JSON.stringify(
            {
              query: query.trim(),
              engines: enginesToUse,
              sampling_applied: shouldSample,
              total_results: results.length,
              results,
            },
            null,
            2,
          ),
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return createResponse(`Search failed: ${errorMessage}`, true);
      }
    },
  );

  // Tool: Visit webpage
  mcpServer.registerTool(
    "visit_webpage",
    {
      description: "Visit a webpage and extract its content",
      inputSchema: {
        url: z.string().url().describe("URL of the page to visit"),
        capture_screenshot: z
          .boolean()
          .optional()
          .default(false)
          .describe("Whether to capture a screenshot"),
      },
    },
    async ({ url, capture_screenshot }) => {
      try {
        const result = await visitPage(url, capture_screenshot);
        return createResponse(
          JSON.stringify(
            {
              url: result.url,
              title: result.title,
              content: result.content,
              screenshot: result.screenshot,
            },
            null,
            2,
          ),
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return createResponse(`Page visit failed: ${errorMessage}`, true);
      }
    },
  );
};
