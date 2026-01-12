import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getConfig } from "../config/index.js";
import { executeMultiEngineSearch } from "../domain/search/execution.js";
import { filterResultsWithSampling } from "../domain/search/filters.js";
import { createResponse } from "./utils/createResponse.js";
import { getSamplingStatus } from "../infrastructure/config/getSampling.js";

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
        "Search the web using multiple engines (e.g., Google, Bing, Brave), merge results, and optionally filter by relevance using an LLM (sampling).",
      inputSchema: {
        query: z.string().describe("The search query"),
        engines: z
          .array(z.string())
          .optional()
          .describe(
            `Engines to use. Available: ${availableEngines.join(", ")}`,
          ),
        max_results: z
          .number()
          .min(1)
          .max(20)
          .default(10)
          .describe("Max results per engine"),
        sampling: z
          .boolean()
          .optional()
          .describe("Override global sampling setting for this request"),
      },
    },
    async ({ query, engines, max_results, sampling }) => {
      try {
        const config = getConfig();

        // 1. Validate engines
        const selectedEngines = engines || config.defaultSearchEngines;
        const validEngines = selectedEngines.filter((e) =>
          availableEngines.includes(e),
        );

        if (validEngines.length === 0) {
          return createResponse(
            `No valid search engines provided. Available: ${availableEngines.join(
              ", ",
            )}`,
            true,
          );
        }

        // Execute the search
        let results = await executeMultiEngineSearch(
          query,
          validEngines,
          max_results,
        );

        // Determine if sampling should be applied
        // Parameter overrides global setting if provided
        const samplingStatus = getSamplingStatus();
        const shouldSample =
          sampling !== undefined ? sampling : samplingStatus.sampling;
        console.debug(
          `Search: Global sampling=${samplingStatus.sampling}, Request override=${sampling}, Effective=${shouldSample}`,
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
              engines: validEngines,
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
