import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Global MCP server instance, exported for use by helpers like callLLM.
 * Moved here to avoid circular imports and side effects from index.ts.
 */
export const mcpServer = new McpServer({
  name: "open-webresearch",
  version: "26.01.12",
});
