import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MergedSearchResult } from "./MergedSearchResult.js";

export interface SamplingFilterOptions {
  query: string;
  results: MergedSearchResult[];
  maxResults: number;
  server: McpServer;
}
