import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createResponse } from "../utils/createResponse.js";

/**
 * Register the wait_for_timeout_silent test tool.
 */
export function registerWaitForTimeoutSilentTool(mcpServer: McpServer): void {
  mcpServer.registerTool(
    "wait_for_timeout_silent",
    {
      description:
        "Test tool: Waits silently for up to 10 minutes to observe MCP client timeout behavior. Logs when cancelled.",
      inputSchema: {},
    },
    async (_args, extra) => {
      const signal = extra?.signal;
      const MAX_WAIT_MS = 10 * 60 * 1000; // 10 minutes
      const startTime = Date.now();

      console.debug("[wait_for_timeout_silent] Starting silent wait...");

      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          const elapsed = Date.now() - startTime;

          if (signal?.aborted) {
            clearInterval(checkInterval);
            console.debug(
              `[wait_for_timeout_silent] CANCELLED after ${Math.round(elapsed / 1000)}s`,
            );
            resolve(
              createResponse(
                `Cancelled after ${Math.round(elapsed / 1000)} seconds`,
                true,
              ),
            );
            return;
          }

          if (elapsed >= MAX_WAIT_MS) {
            clearInterval(checkInterval);
            console.debug(
              `[wait_for_timeout_silent] Completed full 10 minute wait`,
            );
            resolve(
              createResponse("Completed full 10 minute wait without timeout"),
            );
          }
        }, 1000); // Check every second
      });
    },
  );
}
