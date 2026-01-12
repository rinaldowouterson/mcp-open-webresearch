import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getConfig } from "../../config/index.js";
import { executeMultiEngineSearch } from "../helpers/executeMultiEngineSearch.js";
import { filterResultsWithSampling } from "../helpers/filterResultsWithSampling.js";
import { createResponse } from "../helpers/createResponse.js";
import { getSampling } from "../helpers/getSampling.js";

/**
 * Register the search_web tool.
 */
export function registerSearchWebTool(
  mcpServer: McpServer,
  availableEngines: string[],
): void {
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
          : getConfig().defaultSearchEngines;

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
}
