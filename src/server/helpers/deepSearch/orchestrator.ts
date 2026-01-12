/**
 * DeepSearch Orchestrator
 *
 * Orchestrates the research loop involving multiple agents.
 * This is the core domain logic for the deep search feature,
 * decoupled from the MCP transport layer.
 */

import {
  createContextSheet,
  startNewRound,
  appendQueries,
  appendCitations,
  setRefinerFeedback,
  renderContextSheet,
  getAllCitations,
  type ContextSheet,
} from "./contextSheet.js";
import { executeQueryGenerator } from "./agents/queryGenerator.js";
import { executeResultCollector } from "./agents/resultCollector.js";
import { executeCitationExtractor } from "./agents/citationExtractor.js";
import { executeRefiner } from "./agents/refiner.js";
import { executeAnswerSynthesizer } from "./agents/answerSynthesizer.js";

export interface OrchestratorOptions {
  objective: string;
  maxLoops: number;
  resultsPerEngine: number;
  maxCitationUrls: number;
  signal?: AbortSignal;
  /** Callback for progress updates */
  onProgress?: (data: {
    round: number;
    maxRounds: number;
    message: string;
  }) => void;
}

export interface OrchestratorResult {
  answer: string;
  formattedOutput: string;
  contextSheet: ContextSheet;
}

/**
 * Run the full DeepSearch research loop.
 */
export async function runDeepSearch(
  options: OrchestratorOptions,
): Promise<OrchestratorResult> {
  const {
    objective,
    maxLoops,
    resultsPerEngine,
    maxCitationUrls,
    signal,
    onProgress,
  } = options;

  const sessionId = `ds-${Date.now()}`;
  const sheet = createContextSheet(sessionId, objective, maxLoops);

  // Helper to send progress with generic round/maxRounds context
  const reportProgress = (message: string) => {
    if (onProgress) {
      onProgress({
        round: sheet.metrics.loopCount,
        maxRounds: sheet.metrics.maxLoops,
        message,
      });
    }
  };

  // Start Round 1
  startNewRound(sheet);

  // Run QueryGenerator for Round 1
  const initialContext = renderContextSheet(sheet);
  const queryResult = await executeQueryGenerator(initialContext, signal);
  appendQueries(sheet, queryResult.queries);

  // Recursive Research Loop
  while (sheet.metrics.loopCount <= sheet.metrics.maxLoops) {
    if (signal?.aborted) {
      console.debug("[Orchestrator] Cancelled during research loop");
      sheet.status = "COMPLETED";
      break;
    }

    const currentRound = sheet.rounds[sheet.rounds.length - 1];

    // Generate queries if needed (for Round 2+)
    if (currentRound.queries.length === 0) {
      const context = renderContextSheet(sheet);
      const queryResult = await executeQueryGenerator(context, signal);
      if (signal?.aborted) break;
      appendQueries(sheet, queryResult.queries);
    }

    // Progress: After QueryGenerator
    const queryList = currentRound.queries
      .map((q) => `👀: ${q.query} ${q.rationale ? ` (${q.rationale})` : ""}`)
      .join("\n");

    reportProgress(`Searching for:\n${queryList}`);

    // Run ResultCollector
    const searchResults = await executeResultCollector(
      currentRound.queries,
      { resultsPerEngine },
      signal,
    );
    if (signal?.aborted) break;

    // Run CitationExtractor with real-time batched updates
    const existingCitations = getAllCitations(sheet);
    const startingId =
      existingCitations.length > 0
        ? Math.max(...existingCitations.map((c) => c.id)) + 1
        : 1;

    const citationResult = await executeCitationExtractor(
      searchResults.results,
      objective,
      maxCitationUrls,
      existingCitations,
      startingId,
      signal,
      (batch) => {
        const summary = batch
          .filter((b) => b.count > 0)
          .map((b) => `- Extracted ${b.count} citations from ${b.url}`)
          .join("\n");
        if (summary) reportProgress(summary);
      },
    );
    if (signal?.aborted) break;
    appendCitations(sheet, citationResult.citations);

    // Run Refiner
    const refinerDecision = await executeRefiner(sheet, signal);
    if (signal?.aborted) break;

    currentRound.refinerDecision = refinerDecision.decision;
    if (refinerDecision.feedback) {
      setRefinerFeedback(sheet, refinerDecision.feedback);
    }

    // Check exit conditions
    if (refinerDecision.decision === "EXIT") {
      reportProgress("Synthesizing final answer...");
      sheet.status =
        refinerDecision.reason === "budget_exceeded"
          ? "BUDGET_EXCEEDED"
          : "COMPLETED";
      break;
    } else {
      reportProgress("Further improvements required...");
    }

    // Prepare for next round
    if (sheet.metrics.loopCount < sheet.metrics.maxLoops) {
      startNewRound(sheet);
    } else {
      sheet.status = "BUDGET_EXCEEDED";
      break;
    }
  }

  // Final Synthesis
  const synthesis = await executeAnswerSynthesizer(sheet, objective, signal);

  return {
    answer: synthesis.answer,
    formattedOutput: synthesis.formattedOutput,
    contextSheet: sheet,
  };
}
