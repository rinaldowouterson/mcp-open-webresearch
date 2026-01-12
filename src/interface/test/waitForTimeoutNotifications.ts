import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createResponse } from "../utils/createResponse.js";
import { sendProgress } from "../../utils/sendProgress.js";

/**
 * Register the wait_for_timeout_notifications test tool.
 */
export function registerWaitForTimeoutNotificationsTool(
  mcpServer: McpServer,
): void {
  mcpServer.registerTool(
    "wait_for_timeout_notifications",
    {
      description:
        "Test tool: Waits for up to 10 minutes, sending progress notifications every 5 seconds. Logs behavior.",
      inputSchema: {},
    },
    async (_args, extra) => {
      const signal = extra?.signal;
      const MAX_WAIT_MS = 10 * 60 * 1000; // 10 minutes
      const NOTIFICATION_INTERVAL_MS = 5000; // 5 seconds
      const startTime = Date.now();
      let notificationCount = 0;

      console.debug(
        "[wait_for_timeout_notifications] Starting wait with notifications every 5s...",
      );

      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          const elapsed = Date.now() - startTime;
          notificationCount++;

          // Send progress notification
          sendProgress(
            extra,
            notificationCount,
            120, // 10 min / 5 sec = 120 notifications max
            `Notification #${notificationCount} at ${Math.round(elapsed / 1000)}s`,
          );

          console.debug(
            `[wait_for_timeout_notifications] Sent notification #${notificationCount} at ${Math.round(elapsed / 1000)}s`,
          );

          if (signal?.aborted) {
            clearInterval(checkInterval);
            console.debug(
              `[wait_for_timeout_notifications] CANCELLED after ${Math.round(elapsed / 1000)}s (${notificationCount} notifications sent)`,
            );
            resolve(
              createResponse(
                `Cancelled after ${Math.round(elapsed / 1000)}s (${notificationCount} notifications sent)`,
                true,
              ),
            );
            return;
          }

          if (elapsed >= MAX_WAIT_MS) {
            clearInterval(checkInterval);
            console.debug(
              `[wait_for_timeout_notifications] Completed full 10 minute wait (${notificationCount} notifications sent)`,
            );
            resolve(
              createResponse(
                `Completed full 10 minute wait (${notificationCount} notifications sent)`,
              ),
            );
          }
        }, NOTIFICATION_INTERVAL_MS);
      });
    },
  );
}
