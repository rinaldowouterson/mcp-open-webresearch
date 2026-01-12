/**
 * Refiner Agent
 *
 * The loop controller that evaluates research progress and decides
 * whether to continue with another round or exit with synthesis.
 */

import { callLLM } from "../../../infrastructure/callLLM.js";
import { getConfig } from "../../../config/index.js";
import {
  REFINER_SYSTEM_PROMPT,
  buildRefinerUserPrompt,
} from "../prompts/refiner.prompt.js";
import { renderContextSheet } from "../contextSheet.js";
import type {
  ContextSheet,
  RoundData,
  CitationEntry,
} from "../contextSheet.js";

export type RefinerExitReason =
  | "budget_exceeded"
  | "saturation"
  | "criteria_met"
  | "insufficient_sources";

export interface RefinerDecision {
  decision: "CONTINUE" | "EXIT";
  reason: RefinerExitReason | "continue";
  feedback: string | null;
}

interface LLMRefinerResponse {
  decision: "CONTINUE" | "EXIT";
  reason: string;
  feedback: string | null;
}

/**
 * Count new HIGH/MEDIUM citations in a round.
 */
function countQualityCitations(round: RoundData): number {
  return round.citations.filter(
    (c: CitationEntry) => c.quality === "HIGH" || c.quality === "MEDIUM",
  ).length;
}

/**
 * Check for saturation: 2 consecutive rounds with < 3 new quality citations.
 */
function checkSaturation(sheet: ContextSheet): boolean {
  const rounds = sheet.rounds;
  if (rounds.length < 2) return false;

  const last = countQualityCitations(rounds[rounds.length - 1]);
  const secondLast = countQualityCitations(rounds[rounds.length - 2]);

  return last < 3 && secondLast < 3;
}

/**
 * Parse LLM response to extract refiner decision.
 */
function parseRefinerResponse(responseText: string): LLMRefinerResponse {
  let jsonText = responseText.trim();

  // Remove markdown code fencing if present
  const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonText);

    const decision =
      parsed.decision?.toUpperCase() === "EXIT" ? "EXIT" : "CONTINUE";
    const reason =
      parsed.reason || (decision === "EXIT" ? "criteria_met" : "continue");
    const feedback = decision === "CONTINUE" ? parsed.feedback || null : null;

    return { decision, reason, feedback };
  } catch {
    console.debug(
      "[Refiner] Failed to parse JSON response, defaulting to CONTINUE",
    );
    return {
      decision: "CONTINUE",
      reason: "continue",
      feedback: "Parse error - continuing with generic research",
    };
  }
}

/**
 * Execute the Refiner agent.
 * Evaluates research progress and decides CONTINUE or EXIT.
 *
 * Decision priority:
 * 1. Budget exceeded → EXIT
 * 2. Saturation detected → EXIT
 * 3. LLM evaluation → CONTINUE or EXIT
 */
export async function executeRefiner(
  sheet: ContextSheet,
  signal?: AbortSignal,
): Promise<RefinerDecision> {
  const config = getConfig();
  const maxLoops = config.deepSearch.maxLoops;
  const currentLoop = sheet.metrics.loopCount;

  console.debug(`[Refiner] Evaluating round ${currentLoop}/${maxLoops}`);

  // Check for cancellation
  if (signal?.aborted) {
    console.debug("[Refiner] Cancelled");
    return {
      decision: "EXIT",
      reason: "budget_exceeded", // Using existing reason type
      feedback: "Request cancelled",
    };
  }

  // 1. Budget check (deterministic)
  if (currentLoop >= maxLoops) {
    console.debug("[Refiner] Budget exceeded, exiting");
    return {
      decision: "EXIT",
      reason: "budget_exceeded",
      feedback: null,
    };
  }

  // 2. Saturation check (deterministic)
  if (checkSaturation(sheet)) {
    console.debug("[Refiner] Saturation detected, exiting");
    return {
      decision: "EXIT",
      reason: "saturation",
      feedback: null,
    };
  }

  // 3. LLM evaluation
  console.debug("[Refiner] Consulting LLM for decision");
  const renderedSheet = renderContextSheet(sheet);
  const userPrompt = buildRefinerUserPrompt(
    renderedSheet,
    currentLoop,
    maxLoops,
  );

  try {
    const llmResult = await callLLM({
      systemPrompt: REFINER_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.3,
      maxTokens: 500,
    });

    console.debug(`[Refiner] LLM response via ${llmResult.provider}`);

    const parsed = parseRefinerResponse(llmResult.text);

    console.debug(
      `[Refiner] Decision: ${parsed.decision}, Reason: ${parsed.reason}`,
    );

    return {
      decision: parsed.decision,
      reason: parsed.reason as RefinerExitReason | "continue",
      feedback: parsed.feedback,
    };
  } catch (error: any) {
    console.debug(`[Refiner] LLM call failed: ${error.message}, continuing`);
    return {
      decision: "CONTINUE",
      reason: "continue",
      feedback: "LLM evaluation failed - continuing with next round",
    };
  }
}
