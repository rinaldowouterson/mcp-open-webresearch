/**
 * ContextSheet Builder
 *
 * Functions to create, modify, and render the ContextSheet.
 * The ContextSheet is a unified context document that all agents read and append to.
 */

// Minimal types for Phase 2 - will be moved to src/types/deep-search.ts later
export interface QueryEntry {
  query: string;
  rationale?: string;
}

export interface CitationEntry {
  /** Stable sequential ID for referencing in synthesized answer */
  id: number;
  url: string;
  title: string;
  quality: "HIGH" | "MEDIUM" | "LOW" | "REJECTED";
  qualityNote: string;
  /** Verbatim quotes extracted from the source - must be exact copy-paste */
  quotes: string[];
  /** Raw markdown content for CitationChecker verification */
  rawMarkdown: string;
}

export interface RoundData {
  roundNumber: number;
  queries: QueryEntry[];
  citations: CitationEntry[];
  refinerFeedback?: string;
  refinerDecision?: "CONTINUE" | "EXIT";
}

export interface ContextSheet {
  sessionId: string;
  userInput: string;
  rounds: RoundData[];
  status: "ACTIVE" | "COMPLETED" | "BUDGET_EXCEEDED" | "ERROR";
  metrics: {
    loopCount: number;
    maxLoops: number;
  };
}

/**
 * Create a new empty ContextSheet.
 */
export function createContextSheet(
  sessionId: string,
  userInput: string,
  maxLoops: number,
): ContextSheet {
  return {
    sessionId,
    userInput,
    rounds: [],
    status: "ACTIVE",
    metrics: {
      loopCount: 0,
      maxLoops,
    },
  };
}

/**
 * Start a new round in the ContextSheet.
 */
export function startNewRound(sheet: ContextSheet): ContextSheet {
  sheet.metrics.loopCount++;
  sheet.rounds.push({
    roundNumber: sheet.metrics.loopCount,
    queries: [],
    citations: [],
  });
  return sheet;
}

/**
 * Append queries to the current round.
 */
export function appendQueries(
  sheet: ContextSheet,
  queries: QueryEntry[],
): ContextSheet {
  const currentRound = sheet.rounds[sheet.rounds.length - 1];
  if (currentRound) {
    currentRound.queries.push(...queries);
  }
  return sheet;
}

/**
 * Append citations to the current round.
 */
export function appendCitations(
  sheet: ContextSheet,
  citations: CitationEntry[],
): ContextSheet {
  const currentRound = sheet.rounds[sheet.rounds.length - 1];
  if (currentRound) {
    currentRound.citations.push(...citations);
  }
  return sheet;
}

/**
 * Set refiner feedback for current round.
 */
export function setRefinerFeedback(
  sheet: ContextSheet,
  feedback: string,
): ContextSheet {
  const currentRound = sheet.rounds[sheet.rounds.length - 1];
  if (currentRound) {
    currentRound.refinerFeedback = feedback;
  }
  return sheet;
}

/**
 * Set refiner decision for current round.
 */
export function setRefinerDecision(
  sheet: ContextSheet,
  decision: "CONTINUE" | "EXIT",
): ContextSheet {
  const currentRound = sheet.rounds[sheet.rounds.length - 1];
  if (currentRound) {
    currentRound.refinerDecision = decision;
  }
  return sheet;
}

/**
 * Render ContextSheet to markdown string for LLM prompts.
 */
export function renderContextSheet(sheet: ContextSheet): string {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  let output = `# Deep Search Session\n\n**Date:** ${today}\n\n---\n\n`;
  output += `# UserInput\n\n${sheet.userInput}\n\n`;

  // QueryGenerator section
  output += `# QueryGenerator\n\n`;
  for (const round of sheet.rounds) {
    output += `## Round ${round.roundNumber}\n\n`;
    if (round.queries.length === 0) {
      output += `(no queries yet)\n\n`;
    } else {
      for (let i = 0; i < round.queries.length; i++) {
        const q = round.queries[i];
        output += `**${i + 1}. Query:** "${q.query}"\n`;
        if (q.rationale) {
          output += `   *Rationale:* ${q.rationale}\n`;
        }
        output += `\n`;
      }
    }
  }

  // CitationExtractor section
  output += `# CitationExtractor\n\n`;
  let hasCitations = false;
  for (const round of sheet.rounds) {
    if (round.citations.length === 0) continue;
    hasCitations = true;
    output += `## Round ${round.roundNumber}\n\n`;
    for (const cite of round.citations) {
      output += `### [${cite.id}] ${cite.title} | Quality: ${cite.quality}`;
      if (cite.quality !== "HIGH") {
        output += ` | Note: ${cite.qualityNote}`;
      }
      output += `\n#### url: ${cite.url}\n\n`;
      for (const quote of cite.quotes) {
        output += `- "${quote}"\n`;
      }
      output += `\n`;
    }
  }
  if (!hasCitations) {
    output += `(no citations yet)\n\n`;
  }

  // Refiner section
  output += `# Refiner\n\n`;
  let hasRefinerFeedback = false;
  for (const round of sheet.rounds) {
    if (!round.refinerFeedback && !round.refinerDecision) continue;
    hasRefinerFeedback = true;
    output += `## Round ${round.roundNumber}\n\n`;
    if (round.refinerFeedback) {
      output += `Feedback: ${round.refinerFeedback}\n\n`;
    }
    if (round.refinerDecision) {
      output += `Decision: ${round.refinerDecision}\n\n`;
    }
  }
  if (!hasRefinerFeedback) {
    output += `(no feedback yet)\n\n`;
  }

  return output;
}

/**
 * Get all citations across all rounds.
 */
export function getAllCitations(sheet: ContextSheet): CitationEntry[] {
  return sheet.rounds.flatMap((round) => round.citations);
}
