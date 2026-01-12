import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getConfig } from "../../config/index.js";
import { createResponse } from "../helpers/createResponse.js";

/**
 * Register the get_engines tool.
 */
export function registerGetEnginesTool(mcpServer: McpServer): void {
  mcpServer.registerTool(
    "get_engines",
    {
      description: "Check currently configured default search engines",
      inputSchema: {},
    },
    async () => {
      return createResponse(
        JSON.stringify(
          { defaultEngines: getConfig().defaultSearchEngines },
          null,
          2,
        ),
      );
    },
  );
}
