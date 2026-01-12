import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSamplingStatus } from "../infrastructure/config/getSampling.js";
import { createResponse } from "./utils/createResponse.js";

/**
 * Register the get_sampling tool.
 */
export function registerGetSamplingTool(mcpServer: McpServer): void {
  mcpServer.registerTool(
    "get_sampling",
    {
      description:
        "Check whether LLM sampling is currently enabled. When enabled, results are filtered by relevance using an LLM. Disabled by default.",
      inputSchema: {},
    },
    async () => {
      const status = getSamplingStatus();
      return createResponse(JSON.stringify(status, null, 2));
    },
  );
}
