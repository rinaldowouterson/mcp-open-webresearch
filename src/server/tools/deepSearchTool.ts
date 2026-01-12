/**
 * Deep Search Tool Registration
 *
 * Extracted from initializer.ts for separation of concerns.
 * Handles the search_deep MCP tool registration and execution.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getConfig } from "../../config/index.js";
import { renderContextSheet } from "../helpers/deepSearch/contextSheet.js";
import { runDeepSearch } from "../helpers/deepSearch/orchestrator.js";
import { generateDownloadId } from "../helpers/generateDownloadId.js";
import { cacheBuffer } from "../helpers/ephemeralBufferCache.js";
import { createResponse } from "../helpers/createResponse.js";
import {
  sendProgress,
  type ProgressContext,
} from "../../utils/sendProgress.js";

/**
 * Register the search_deep tool with the MCP server.
 *
 * @param mcpServer - The MCP server instance
 * @param availableEngines - List of available search engine names
 */
export function registerDeepSearchTool(
  mcpServer: McpServer,
  availableEngines: string[],
): void {
  const config = getConfig();

  mcpServer.registerTool(
    "search_deep",
    {
      description:
        "Perform deep research on a topic. Searches multiple sources, extracts citations, and synthesizes a comprehensive answer. Requires LLM sampling capability.",
      inputSchema: {
        objective: z
          .string()
          .min(10, "Objective must be at least 10 characters")
          .describe("The research goal or question to investigate deeply"),
        max_loops: z
          .number()
          .min(1)
          .max(50)
          .default(config.deepSearch.maxLoops)
          .describe(
            `Maximum research iterations (default: ${config.deepSearch.maxLoops})`,
          ),
        results_per_engine: z
          .number()
          .min(1)
          .max(20)
          .default(config.deepSearch.resultsPerEngine)
          .describe(
            `Search results per engine (default: ${config.deepSearch.resultsPerEngine})`,
          ),
        max_citation_urls: z
          .number()
          .min(-1)
          .max(50)
          .default(config.deepSearch.maxCitationUrls)
          .describe(
            `Maximum citations to extract (default: ${config.deepSearch.maxCitationUrls}, -1 for no limit)`,
          ),
        engines: z
          .array(z.string())
          .optional()
          .describe(
            `Engines to use. Available: ${availableEngines.join(", ")}`,
          ),
        attach_context: z
          .boolean()
          .default(false)
          .optional()
          .describe(
            "If true, append the raw ContextSheet after the answer for debugging/transparency",
          ),
      },
    },
    async (
      {
        objective,
        attach_context,
        max_loops,
        results_per_engine,
        max_citation_urls,
      },
      extra,
    ) => {
      try {
        const signal = extra?.signal;
        const progressCtx = extra as ProgressContext;

        // Run the orchestrator
        const { formattedOutput, contextSheet } = await runDeepSearch({
          objective,
          maxLoops: max_loops,
          resultsPerEngine: results_per_engine,
          maxCitationUrls: max_citation_urls,
          signal,
          onProgress: (p) => {
            sendProgress(progressCtx, p.round, p.maxRounds, p.message);
          },
        });

        // Construct final response
        let output = formattedOutput;
        if (attach_context) {
          output += `\n\n\n------\n\n`;
          output += renderContextSheet(contextSheet);
        }

        // Cache for download
        const downloadId = generateDownloadId();
        cacheBuffer(downloadId, Buffer.from(output, "utf-8"));

        const downloadUrl = `${getConfig().publicUrl}/download/${downloadId}`;
        console.debug(`Download URL: ${downloadUrl}`);
        output = `Download URL: ${downloadUrl}\n\n${output}`;

        return createResponse(output);
      } catch (error: any) {
        return createResponse(`Deep search failed: ${error.message}`, true);
      }
    },
  );
}
