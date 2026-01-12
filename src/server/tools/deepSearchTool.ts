/**
 * Deep Search Tool Registration
 *
 * Extracted from initializer.ts for separation of concerns.
 * Handles the search_deep MCP tool registration and execution.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getConfig } from "../../config/index.js";
import {
  createContextSheet,
  startNewRound,
  appendQueries,
  appendCitations,
  setRefinerFeedback,
  renderContextSheet,
  getAllCitations,
} from "../helpers/deepSearch/contextSheet.js";
import { executeQueryGenerator } from "../helpers/deepSearch/agents/queryGenerator.js";
import { executeResultCollector } from "../helpers/deepSearch/agents/resultCollector.js";
import { executeCitationExtractor } from "../helpers/deepSearch/agents/citationExtractor.js";
import { executeRefiner } from "../helpers/deepSearch/agents/refiner.js";
import { executeAnswerSynthesizer } from "../helpers/deepSearch/agents/answerSynthesizer.js";
import { generateDownloadId } from "../helpers/generateDownloadId.js";
import { cacheBuffer } from "../helpers/ephemeralBufferCache.js";
import { createResponse } from "../helpers/createResponse.js";
import {
  sendProgress,
  type ProgressContext,
} from "../../utils/sendProgress.js";

/**
 * Register the search_deep tool with the MCP server.
 *
 * @param mcpServer - The MCP server instance
 * @param availableEngines - List of available search engine names
 */
export function registerDeepSearchTool(
  mcpServer: McpServer,
  availableEngines: string[],
): void {
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
        const progressCtx = extra as ProgressContext;

        // Create ContextSheet, run QueryGenerator
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
            progressCtx,
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
                  progressCtx,
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
              progressCtx,
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
              progressCtx,
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

        // Cache the result
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
}
