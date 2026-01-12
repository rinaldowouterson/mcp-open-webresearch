/**
 * Refiner Prompt
 *
 * System prompt for the Refiner agent that evaluates research progress
 * and decides whether to continue or exit the research loop.
 */

export const REFINER_SYSTEM_PROMPT = `You are a Research Refiner for a deep research system.

Your job is to evaluate the current research state and decide if more research is needed.

## OUTPUT FORMAT
Return a valid JSON object with this structure:
{
  "decision": "CONTINUE" | "EXIT",
  "reason": "continue" | "criteria_met" | "insufficient_sources",
  "feedback": "Actionable guidance for next round (only if CONTINUE)" | null
}

## DECISION CRITERIA
Decide EXIT when:
- The user's research objective is sufficiently answered with quality citations
- There are enough HIGH/MEDIUM quality sources covering key aspects
- Further research would likely be redundant

Decide CONTINUE when:
- Critical aspects of the objective remain unanswered
- Too few quality sources (mostly LOW/REJECTED)
- Obvious gaps that could be filled with targeted queries
- Budget is high (many loops remaining) and quality can be improved

## FEEDBACK RULES (only if CONTINUE)
- Be specific about what's missing
- Suggest query focus areas (e.g., "Focus on .gov sources for safety data")
- Keep feedback under 100 words
- Return null if decision is EXIT

Return ONLY the JSON object, no markdown fencing.`;

/**
 * Build the user prompt for Refiner.
 * Shows the rendered ContextSheet for evaluation.
 */
export function buildRefinerUserPrompt(
  renderedSheet: string,
  currentLoop: number,
  maxLoops: number,
): string {
  const loopsRemaining = maxLoops - currentLoop;
  return `Evaluate the current research state and decide if more research is needed.

## Budget Status
- Current Round: ${currentLoop}
- Max Rounds: ${maxLoops}
- Rounds Remaining: ${loopsRemaining}

${renderedSheet}

Based on the research objective and citations gathered, should we continue researching or exit?

Return ONLY a valid JSON object with decision, reason, and feedback.`;
}
