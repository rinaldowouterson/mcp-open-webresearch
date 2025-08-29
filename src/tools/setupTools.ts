// tools/setupTools.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchBing } from "../engines/bing/index.js";
import { SearchResult } from "../types.js";
import { z } from "zod";
import { searchDuckDuckGo } from "../engines/duckduckgo/index.js";
import { searchBrave } from "../engines/brave/index.js";

// 支持的搜索引擎
const SUPPORTED_ENGINES = ["bing", "duckduckgo", "brave"] as const;
type SupportedEngine = (typeof SUPPORTED_ENGINES)[number];

// 搜索引擎调用函数映射
const engineMap: Record<
  any,
  (query: string, limit: number) => Promise<SearchResult[]>
> = {
  bing: searchBing,
  duckduckgo: searchDuckDuckGo,
  brave: searchBrave,
};

// 分配搜索结果数量
const distributeLimit = (totalLimit: number, engineCount: number): number[] => {
  const base = Math.floor(totalLimit / engineCount);
  const remainder = totalLimit % engineCount;

  return Array.from(
    { length: engineCount },
    (_, i) => base + (i < remainder ? 1 : 0)
  );
};

// 执行搜索
const executeSearch = async (
  query: string,
  engines: string[],
  limit: number
): Promise<SearchResult[]> => {
  // Clean up the query string to ensure it won't cause issues due to spaces or special characters
  const cleanQuery = query.trim();
  console.log(
    `[DEBUG] Executing search, query: "${cleanQuery}", engines: ${engines.join(
      ", "
    )}, limit: ${limit}`
  );

  if (!cleanQuery) {
    console.error("Query string is empty");
    throw new Error("Query string cannot be empty");
  }

  const limits = distributeLimit(limit, engines.length);

  const searchTasks = engines.map((engine, index) => {
    const engineLimit = limits[index];
    const searchFn = engineMap[engine as SupportedEngine];

    if (!searchFn) {
      console.warn(`Unsupported search engine: ${engine}`);
      return Promise.resolve([]);
    }

    return searchFn(query, engineLimit).catch((error) => {
      console.error(`Search failed for engine ${engine}:`, error);
      return [];
    });
  });

  try {
    const results = await Promise.all(searchTasks);
    return results.flat().slice(0, limit);
  } catch (error) {
    console.error("Search execution failed:", error);
    throw error;
  }
};

export const setupTools = (server: McpServer): void => {
  // 搜索工具
  server.tool(
    "search",
    "Search the web using multiple engines (e.g., Bing, DuckDuckGo, Brave) with no API key required",
    {
      query: z.string().min(1, "Search query must not be empty"),
      limit: z.number().min(1).max(50).default(10),
      engines: z.array(z.enum(["bing", "duckduckgo", "brave"])).min(1),
      // .default([config.defaultSearchEngine]),
    },
    async ({ query, limit = 10, engines = ["bing"] }) => {
      try {
        console.log(
          `Searching for "${query}" using engines: ${engines.join(", ")}`
        );

        const results = await executeSearch(query.trim(), engines, limit);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  query: query.trim(),
                  engines: engines,
                  totalResults: results.length,
                  results: results,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        console.error("Search tool execution failed:", error);
        return {
          content: [
            {
              type: "text",
              text: `Search failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            },
          ],
          isError: true,
        };
      }
    }
  );
};
