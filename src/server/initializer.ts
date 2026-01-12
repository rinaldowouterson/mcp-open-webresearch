import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerNotification } from "@modelcontextprotocol/sdk/types.js";
import { visitPage } from "../engines/visit_page/visit.js";
import { z } from "zod";
import { getConfig } from "../config/index.js";
import { getEngineNames } from "../engines/search/registry.js";
import { executeMultiEngineSearch } from "./helpers/executeMultiEngineSearch.js";
import { updateDefaultSearchEngines } from "./helpers/updateDefaultSearchEngines.js";
import { updateSampling } from "./helpers/updateSampling.js";
import { getSampling, getSamplingResponse } from "./helpers/getSampling.js";
import { filterResultsWithSampling } from "./helpers/filterResultsWithSampling.js";
import { createResponse } from "./helpers/createResponse.js";
import {
  createContextSheet,
  startNewRound,
  appendQueries,
  appendCitations,
  setRefinerFeedback,
  renderContextSheet,
  getAllCitations,
} from "./helpers/deepSearch/contextSheet.js";
import { executeQueryGenerator } from "./helpers/deepSearch/agents/queryGenerator.js";
import { executeResultCollector } from "./helpers/deepSearch/agents/resultCollector.js";
import { executeCitationExtractor } from "./helpers/deepSearch/agents/citationExtractor.js";
import { executeRefiner } from "./helpers/deepSearch/agents/refiner.js";
import { executeAnswerSynthesizer } from "./helpers/deepSearch/agents/answerSynthesizer.js";
import { generateDownloadId } from "./helpers/generateDownloadId.js";
import { cacheBuffer } from "./helpers/ephemeralBufferCache.js";

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
 * Helper to send progress notifications to the client.
 * Only sends if the client provided a progressToken in the request.
 */
function sendProgress(
  extra: {
    _meta?: { progressToken?: string | number };
    sendNotification: (n: ServerNotification) => Promise<void>;
  },
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

export const serverInitializer = (mcpServer: McpServer): void => {
  // Tool: Update default search engines
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

  // Tool: Get current engines
  mcpServer.registerTool(
    "get_engines",
    {
      description: "Check currently configured default search engines",
      inputSchema: {},
    },
    async () => {
      return createResponse(
        JSON.stringify(
          { defaultEngines: getConfig().defaultSearchEngines },
          null,
          2,
        ),
      );
    },
  );

  // Tool: Set sampling
  mcpServer.registerTool(
    "set_sampling",
    {
      description:
        "Enable or disable LLM-based relevance filtering for search results. When enabled, an LLM evaluates each result for relevance to the query. Requires either: (1) IDE/client with sampling support, OR (2) LLM_BASE_URL set (LLM_API_KEY optional for local models). Persists setting to .env",
      inputSchema: {
        enabled: z
          .boolean()
          .describe("Whether to enable sampling for search results"),
      },
    },
    async ({ enabled }) => {
      return await updateSampling(enabled);
    },
  );

  // Tool: Get sampling status
  mcpServer.registerTool(
    "get_sampling",
    {
      description:
        "Check whether LLM sampling is currently enabled. When enabled, results are filtered by relevance using an LLM. Disabled by default.",
      inputSchema: {},
    },
    async () => {
      return getSamplingResponse();
    },
  );

  // Tool: Web search
  mcpServer.registerTool(
    "search_web",
    {
      description:
        "Search the web using multiple engines. When sampling is enabled, results are filtered using the client's LLM to remove irrelevant content.",
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
            "Maximum number of results to return PER ENGINE. Default is 10. Max is 50. Total results is the sum of all engines' results.",
          ),
        engines: z
          .array(z.string())
          .min(1)
          .optional()
          .describe(
            `Engines to use. Available: ${availableEngines.join(", ")}`,
          ),
        sampling: z
          .boolean()
          .optional()
          .describe(
            "Override global sampling setting. When true, filters results using the client's LLM. Defaults to global setting.",
          ),
      },
    },
    async ({ query, max_results = 10, engines, sampling }) => {
      try {
        // Use provided engines or fall back to configured defaults
        const enginesToUse = engines?.length
          ? engines
          : getConfig().defaultSearchEngines;

        // Execute the search
        let results = await executeMultiEngineSearch(
          query,
          enginesToUse,
          max_results,
        );

        // Determine if sampling should be applied
        // Parameter overrides global setting if provided
        const shouldSample = sampling !== undefined ? sampling : getSampling();
        console.debug(
          `Search: Global sampling=${getSampling()}, Request override=${sampling}, Effective=${shouldSample}`,
        );

        // Apply sampling filter if enabled
        if (shouldSample && results.length > 0) {
          console.debug(
            `Search: invoking sampling filter on ${results.length} results...`,
          );
          results = await filterResultsWithSampling({
            query: query.trim(),
            results,
            maxResults: max_results,
            server: mcpServer,
          });
          console.debug(
            `Search: sampling complete. Returning ${results.length} results.`,
          );
        } else if (shouldSample && results.length === 0) {
          console.debug(
            "Search: verification enabled but no results to sample.",
          );
        } else {
          console.debug("Search: sampling disabled, returning raw results.");
        }

        return createResponse(
          JSON.stringify(
            {
              query: query.trim(),
              engines: enginesToUse,
              sampling_applied: shouldSample,
              total_results: results.length,
              results,
            },
            null,
            2,
          ),
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return createResponse(`Search failed: ${errorMessage}`, true);
      }
    },
  );

  // Tool: Visit webpage
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

  // Tool: Deep Search (Phase 1 - Stub)
  mcpServer.registerTool(
    "search_deep",
    {
      description:
        "Perform deep research on a topic. Searches multiple sources, extracts citations, and synthesizes a comprehensive answer. Requires LLM sampling capability.",
      inputSchema: {
        objective: z
          .string()
          .min(10, "Objective must be at least 10 characters")
          .describe("The research goal or question to investigate deeply"),
        max_loops: z
          .number()
          .min(1)
          .max(50)
          .default(getConfig().deepSearch.maxLoops)

          .describe(
            `Maximum research iterations (recommended and default value: ${getConfig().deepSearch.maxLoops})`,
          ),
        results_per_engine: z
          .number()
          .min(1)
          .max(20)
          .default(getConfig().deepSearch.resultsPerEngine)
          .describe("Search results per engine (default: 10)"),
        max_citation_urls: z
          .number()
          .min(-1)
          .max(50)
          .default(getConfig().deepSearch.maxCitationUrls)
          .describe(
            `Maximum citations to extract (default: ${getConfig().deepSearch.maxCitationUrls}, -1 for no limit)`,
          ),
        engines: z
          .array(z.string())
          .optional()
          .describe(
            `Engines to use. Available: ${availableEngines.join(", ")}`,
          ),
        attach_context: z
          .boolean()
          .default(false)
          .optional()
          .describe(
            "If true, append the raw ContextSheet after the answer for debugging/transparency",
          ),
      },
    },
    async (
      {
        objective,
        attach_context,
        max_loops,
        results_per_engine,
        max_citation_urls,
      },
      extra,
    ) => {
      try {
        const signal = extra?.signal;

        // Phase 3: Create ContextSheet, run QueryGenerator
        const config = getConfig();
        const sessionId = `ds-${Date.now()}`;
        const sheet = createContextSheet(sessionId, objective, max_loops);

        // Start Round 1
        startNewRound(sheet);

        // Run QueryGenerator for Round 1
        const initialContext = renderContextSheet(sheet);
        const queryResult = await executeQueryGenerator(initialContext, signal);
        appendQueries(sheet, queryResult.queries);

        // Recursive Research Loop
        while (sheet.metrics.loopCount <= sheet.metrics.maxLoops) {
          // Check for cancellation at the start of each loop
          if (signal?.aborted) {
            console.debug("[DeepSearch] Cancelled during research loop");
            sheet.status = "COMPLETED";
            break;
          }

          const currentRound = sheet.rounds[sheet.rounds.length - 1];

          // Generate queries if needed (for Round 2+)
          if (currentRound.queries.length === 0) {
            const context = renderContextSheet(sheet);
            const queryResult = await executeQueryGenerator(context, signal);
            appendQueries(sheet, queryResult.queries);
          }

          // Progress: After QueryGenerator
          const queryList = currentRound.queries
            .map(
              (q) =>
                `👀: ${q.query} 
🎓: ${q.rationale ? ` (${q.rationale})` : ""}

`,
            )
            .join("\n");
          sendProgress(
            extra,
            sheet.metrics.loopCount,
            sheet.metrics.maxLoops,
            `Round ${sheet.metrics.loopCount}: Searching for\n${queryList}`,
          );

          // Run ResultCollector
          const searchResults = await executeResultCollector(
            currentRound.queries,
            { resultsPerEngine: results_per_engine },
            signal,
          );

          // Run CitationExtractor with progress callback for batched updates
          const existingCitations = getAllCitations(sheet);
          const startingId =
            existingCitations.length > 0
              ? Math.max(...existingCitations.map((c) => c.id)) + 1
              : 1;
          const citationResult = await executeCitationExtractor(
            searchResults.results,
            objective,
            max_citation_urls,
            existingCitations,
            startingId,
            signal,
            // Progress callback: fires every 5 URLs
            (batch) => {
              const summary = batch
                .filter((b) => b.count > 0)
                .map((b) => `- Extracted ${b.count} citations from ${b.url}`)
                .join("\n");
              if (summary) {
                sendProgress(
                  extra,
                  sheet.metrics.loopCount,
                  sheet.metrics.maxLoops,
                  `Round ${sheet.metrics.loopCount}:\n${summary}`,
                );
              }
            },
          );
          appendCitations(sheet, citationResult.citations);

          // Run Refiner
          const refinerDecision = await executeRefiner(sheet, signal);

          // Record decision
          if (currentRound) {
            currentRound.refinerDecision = refinerDecision.decision;
            if (refinerDecision.feedback) {
              setRefinerFeedback(sheet, refinerDecision.feedback);
            }
          }

          // Check exit conditions
          if (refinerDecision.decision === "EXIT") {
            // Progress: Synthesizing
            sendProgress(
              extra,
              sheet.metrics.maxLoops,
              sheet.metrics.maxLoops,
              `Round ${sheet.metrics.loopCount}: Synthesizing final answer`,
            );
            sheet.status =
              refinerDecision.reason === "budget_exceeded"
                ? "BUDGET_EXCEEDED"
                : "COMPLETED";
            break;
          } else {
            // Progress: Continuing
            sendProgress(
              extra,
              sheet.metrics.loopCount,
              sheet.metrics.maxLoops,
              `Round ${sheet.metrics.loopCount}: Further improvements required`,
            );
          }

          // Prepare for next round if budget allows
          if (sheet.metrics.loopCount < sheet.metrics.maxLoops) {
            startNewRound(sheet);
          } else {
            sheet.status = "BUDGET_EXCEEDED";
            break;
          }
        }

        // Final Synthesis
        const synthesis = await executeAnswerSynthesizer(
          sheet,
          objective,
          signal,
        );

        // Final Output Construction
        const downloadId = generateDownloadId();
        let finalOutput = `# Deep Search Result\n\n${synthesis.formattedOutput}`;

        // Optionally attach ContextSheet for debugging/transparency
        if (attach_context) {
          finalOutput += `\n\n\n------\n\n`;
          finalOutput += renderContextSheet(sheet);
        }

        // Cache the result (Phase 1: Factory Manager - Main Thread storage)
        cacheBuffer(downloadId, Buffer.from(finalOutput, "utf-8"));

        const downloadUrl = `${getConfig().publicUrl}/download/${downloadId}`;
        finalOutput = `Download URL: ${downloadUrl}\n\n${finalOutput}`;

        return createResponse(finalOutput);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return createResponse(`Deep search failed: ${errorMessage}`, true);
      }
    },
  );

  // Test Tool: Wait silently to observe timeout behavior
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

  // Test Tool: Wait with notifications every 5 seconds
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
};
