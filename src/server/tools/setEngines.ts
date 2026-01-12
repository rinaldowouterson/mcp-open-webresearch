import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { updateDefaultSearchEngines } from "../helpers/updateDefaultSearchEngines.js";

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
      return await updateDefaultSearchEngines(engines);
    },
  );
}
