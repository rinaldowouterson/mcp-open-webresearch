import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { visitPage } from "../engines/visit_page/visit.js";
import { z } from "zod";
import { loadConfig } from "../config/index.js";
import { SUPPORTED_ENGINES } from "../types/index.js";
import { executeMultiEngineSearch } from "./helpers/executeMultiEngineSearch.js";
import { updateDefaultSearchEngines } from "./helpers/updateDefaultSearchEngines.js";
import { createResponse } from "./helpers/createResponse.js";

export const serverInitializer = (server: McpServer): void => {
  // Tool: Update default search engines
  server.registerTool(
    "update_default",
    {
      description: "Update default search engines and persist to .env",
      inputSchema: {
        engines: z
          .array(z.enum(SUPPORTED_ENGINES))
          .min(1)
          .describe("Comma-separated list of search engines to set as default"),
      },
    },
    async ({ engines }) => {
      return await updateDefaultSearchEngines(engines);
    }
  );

  // Tool: Check current defaults
  server.registerTool(
    "check_default",
    {
      description: "Check currently configured default search engines",
      inputSchema: {},
    },
    async () => {
      return createResponse(
        JSON.stringify(
          { defaultEngines: loadConfig().defaultSearchEngines },
          null,
          2
        )
      );
    }
  );

  // Tool: Web search
  server.registerTool(
    "search_web",
    {
      description: "Search the web using multiple engines",
      inputSchema: {
        query: z
          .string()
          .min(1, "Search query must not be empty")
          .describe("Search query string"),
        max_results: z
          .number()
          .min(1)
          .max(50)
          .default(10)
          .describe(
            "Maximum number of results to return. Current default is 10. Maximum is 50. It's distributed across engines."
          ),
        engines: z
          .array(z.enum(SUPPORTED_ENGINES))
          .min(1)
          .optional()
          .describe(
            `Engines to use. Current default is ${
            loadConfig().defaultSearchEngines
          }`
          ),
      },
    },
    async ({ query, max_results = 10, engines }) => {
      try {
        // Use provided engines or fall back to configured defaults
        const enginesToUse = engines?.length
          ? engines
          : loadConfig().defaultSearchEngines;

        const results = await executeMultiEngineSearch(
          query,
          enginesToUse,
          max_results
        );

        return createResponse(
          JSON.stringify(
            {
              query: query.trim(),
              engines: enginesToUse,
              total_results: results.length,
              results,
            },
            null,
            2
          )
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return createResponse(`Search failed: ${errorMessage}`, true);
      }
    }
  );

  // Tool: Visit webpage
  server.registerTool(
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
            2
          )
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return createResponse(`Page visit failed: ${errorMessage}`, true);
      }
    }
  );
};
