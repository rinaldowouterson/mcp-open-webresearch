import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getEngineNames } from "../engines/search/registry.js";
import { registerDeepSearchTool } from "./tools/deepSearchTool.js";
import { registerSetEnginesTool } from "./tools/setEngines.js";
import { registerGetEnginesTool } from "./tools/getEngines.js";
import { registerSetSamplingTool } from "./tools/setSampling.js";
import { registerGetSamplingTool } from "./tools/getSampling.js";
import { registerSearchWebTool } from "./tools/searchWeb.js";
import { registerVisitWebpageTool } from "./tools/visitWebpage.js";
import { registerWaitForTimeoutSilentTool } from "./tools/test/waitForTimeoutSilent.js";
import { registerWaitForTimeoutNotificationsTool } from "./tools/test/waitForTimeoutNotifications.js";

// Cache for available engine names (populated at startup)
let availableEngines: string[] = [];

/**
 * Initialize the engine registry cache. Call before registering tools.
 */
export const initEngineRegistry = async (): Promise<void> => {
  availableEngines = await getEngineNames();
  console.debug(`Available engines: ${availableEngines.join(", ")}`);
};

/**
 * Main Server Initializer
 * Registers all MCP tools.
 */
export const serverInitializer = (mcpServer: McpServer): void => {
  // Config Tools
  registerSetEnginesTool(mcpServer, availableEngines);
  registerGetEnginesTool(mcpServer);
  registerSetSamplingTool(mcpServer);
  registerGetSamplingTool(mcpServer);

  // Core Tools
  registerSearchWebTool(mcpServer, availableEngines);
  registerVisitWebpageTool(mcpServer);
  registerDeepSearchTool(mcpServer, availableEngines);

  // Test Tools (only available in test environment)
  if (process.env.NODE_ENV === "test") {
    registerWaitForTimeoutSilentTool(mcpServer);
    registerWaitForTimeoutNotificationsTool(mcpServer);
  }
};
