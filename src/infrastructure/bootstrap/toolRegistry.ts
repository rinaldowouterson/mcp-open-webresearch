import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getEngineNames } from "../search/registry.js";
import { registerDeepSearchTool } from "../../interface/deepSearchTool.js";
import { registerSetEnginesTool } from "../../interface/setEngines.js";
import { registerGetEnginesTool } from "../../interface/getEngines.js";
import { registerSetSamplingTool } from "../../interface/setSampling.js";
import { registerGetSamplingTool } from "../../interface/getSampling.js";
import { registerSearchWebTool } from "../../interface/searchWeb.js";
import { registerVisitWebpageTool } from "../../interface/visitWebpage.js";
import { registerWaitForTimeoutSilentTool } from "../../interface/test/waitForTimeoutSilent.js";
import { registerWaitForTimeoutNotificationsTool } from "../../interface/test/waitForTimeoutNotifications.js";

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
