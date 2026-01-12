import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { updateSampling } from "../helpers/updateSampling.js";

/**
 * Register the set_sampling tool.
 */
export function registerSetSamplingTool(mcpServer: McpServer): void {
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
}
