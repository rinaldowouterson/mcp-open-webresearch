import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { visitPage } from "../infrastructure/visit_page/visit.js";
import { createResponse } from "./utils/createResponse.js";

/**
 * Register the visit_webpage tool.
 */
export function registerVisitWebpageTool(mcpServer: McpServer): void {
  mcpServer.registerTool(
    "visit_webpage",
    {
      description: "Visit a webpage and extract its content",
      inputSchema: {
        url: z.string().url().describe("URL of the page to visit"),
        capture_screenshot: z
          .boolean()
          .optional()
          .default(false)
          .describe("Whether to capture a screenshot"),
      },
    },
    async ({ url, capture_screenshot }) => {
      try {
        const result = await visitPage(url, capture_screenshot);
        return createResponse(
          JSON.stringify(
            {
              url: result.url,
              title: result.title,
              content: result.content,
              screenshot: result.screenshot,
            },
            null,
            2,
          ),
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return createResponse(`Page visit failed: ${errorMessage}`, true);
      }
    },
  );
}
