import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { updateDefaultSearchEngines } from "../infrastructure/config/updateEngines.js";
import { createResponse } from "./utils/createResponse.js";

/**
 * Register the set_engines tool.
 */
export function registerSetEnginesTool(
  mcpServer: McpServer,
  availableEngines: string[],
): void {
  mcpServer.registerTool(
    "set_engines",
    {
      description: "Update default search engines and persist to .env",
      inputSchema: {
        engines: z
          .array(z.string())
          .min(1)
          .refine(
            (arr) => arr.every((e) => availableEngines.includes(e)),
            `Invalid engine. Available: ${availableEngines.join(", ")}`,
          )
          .describe(
            `List of search engines to set as default. Available: ${availableEngines.join(
              ", ",
            )}`,
          ),
      },
    },
    async ({ engines }) => {
      try {
        await updateDefaultSearchEngines(engines);
        return createResponse(
          `Updated default engines to: ${engines.join(", ")} and persisted to .env`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return createResponse(
          `Failed to update defaults: ${errorMessage}`,
          true,
        );
      }
    },
  );
}
