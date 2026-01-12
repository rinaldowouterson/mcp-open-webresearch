/**
 * Progress Notification Utility
 *
 * Shared helper for sending MCP progress notifications.
 * Used by long-running tools like search_deep.
 */

import type { ServerNotification } from "@modelcontextprotocol/sdk/types.js";

export interface ProgressContext {
  _meta?: { progressToken?: string | number };
  sendNotification: (n: ServerNotification) => Promise<void>;
}

/**
 * Send progress notifications to the MCP client.
 * Only sends if the client provided a progressToken in the request.
 */
export function sendProgress(
  extra: ProgressContext,
  progress: number,
  total: number,
  message: string,
): void {
  const token = extra._meta?.progressToken;
  if (!token) return; // Client didn't request progress notifications

  extra.sendNotification({
    method: "notifications/progress",
    params: {
      progressToken: token,
      progress,
      total,
      message,
    },
  } as ServerNotification);
}
