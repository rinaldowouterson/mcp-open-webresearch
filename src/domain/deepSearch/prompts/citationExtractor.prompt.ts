/**
 * CitationExtractor Prompt
 *
 * System prompt for the CitationExtractor agent that visits pages,
 * extracts verbatim quotes, and assesses source quality.
 */

export const CITATION_EXTRACTOR_SYSTEM_PROMPT = `You are a Citation Extractor for a deep research system.

Your job is to analyze page content and extract EXACT VERBATIM quotes that support the research objective.

## INPUT
You will receive:
1. The user's research objective
2. The page content in markdown format

## OUTPUT FORMAT
Return a valid JSON object with this structure:
{
  "quality": "HIGH|MEDIUM|LOW|REJECTED",
  "qualityNote": "Mandatory explanation of quality assessment",
  "quotes": [
    "Exact verbatim quote from the page",
    "Another exact quote"
  ]
}

## QUALITY CRITERIA
- HIGH: Authoritative source (official docs, academic, reputable tech publications)
- MEDIUM: Generally reliable (established blogs, tutorials, community content)
- LOW: Use with caution (commercial sites, outdated content, potentially biased)
- REJECTED: Do not use (spam, completely irrelevant, untrustworthy)

## CRITICAL VERBATIM RULES
1. COPY-PASTE ONLY: Each quote MUST be an exact character-for-character copy from the page content
2. NO PARAPHRASING: Never reword, summarize, or rephrase any text
3. NO MODIFICATIONS: Do not fix typos, grammar, or formatting in quotes
4. NO COMBINING: Do not merge multiple sentences unless they appear exactly that way in the source
5. VERIFICATION: Each quote you return MUST exist as a contiguous substring in the provided page content
6. If you cannot find relevant EXACT quotes, return an empty quotes array - do NOT fabricate

## OTHER RULES
- qualityNote is MANDATORY - explain why you assigned that quality level
- If page content is empty or irrelevant, return quality: "REJECTED" with empty quotes
- Return 3-7 quotes from HIGH/MEDIUM sources, fewer from LOW
- Return ONLY the JSON object, no markdown fencing`;

import { CitationEntry } from "../contextSheet.js";

/**
 * Build the user prompt for CitationExtractor.
 */
export function buildCitationExtractorUserPrompt(
  objective: string,
  pageUrl: string,
  pageTitle: string,
  pageContent: string,
  existingCitations: CitationEntry[] = [],
): string {
  // Limit content to ~8000 chars to stay within context limits
  const truncatedContent =
    pageContent.length > 8000
      ? pageContent.slice(0, 8000) + "\n\n[Content truncated...]"
      : pageContent;

  let previouslyFound = "";
  if (existingCitations.length > 0) {
    previouslyFound = `
## Previously Extracted Quotes (SKIP THESE)
The following quotes have ALREADY been extracted from this page in previous rounds. DO NOT extract these quotes again. Look for NEW information.
`;
    // We only pass citations from this specific URL, so we can list them all (or limit if needed)
    for (const cite of existingCitations) {
      // cite.quotes is an array of strings
      for (const quote of cite.quotes) {
        previouslyFound += `- "${quote}"\n`;
      }
    }
  }

  return `Extract citations from this page for the research objective.

## Research Objective
${objective}
${previouslyFound}
## Page Information
**URL:** ${pageUrl}
**Title:** ${pageTitle}

## Page Content
${truncatedContent}

Analyze this page and extract relevant verbatim quotes. Return ONLY a valid JSON object.`;
}

/**
 * Build a retry prompt when some quotes failed verbatim verification.
 * Asks the LLM to find replacement quotes that actually exist in the source.
 */
export function buildCitationRetryPrompt(
  objective: string,
  pageUrl: string,
  pageTitle: string,
  pageContent: string,
  rejectedQuotes: string[],
  verifiedQuotes: string[],
): string {
  const truncatedContent =
    pageContent.length > 8000
      ? pageContent.slice(0, 8000) + "\n\n[Content truncated...]"
      : pageContent;

  let rejectedSection = `
## FAILED QUOTES - These were NOT found verbatim in the source
The following quotes you provided do NOT exist as exact substrings in the page content. You must find REPLACEMENT quotes that actually appear in the text:

`;
  for (const quote of rejectedQuotes) {
    rejectedSection += `- "${quote}"\n`;
  }

  let verifiedSection = "";
  if (verifiedQuotes.length > 0) {
    verifiedSection = `
## VERIFIED QUOTES - Keep these, do NOT repeat them
These quotes passed verification and will be kept:

`;
    for (const quote of verifiedQuotes) {
      verifiedSection += `- "${quote}"\n`;
    }
  }

  return `RETRY: Some quotes failed verbatim verification. Find replacement quotes.

## Research Objective
${objective}

${rejectedSection}
${verifiedSection}
## REJECTION RULES (WHY YOUR QUOTES FAILED)
Your previous quotes were rejected because they violated one of these rules:
1. **Data Mismatch**: You changed numbers (e.g. 1,000 -> 1000) or spelling.
2. **Structural Change**: You omitted words or combined sentences.
3. **Hallucination**: The text simply does not exist.

Common Fixes:
- Do NOT "clean up" the text.
- Copy exactly, even with typos or odd formatting.
- Ignore bold/italics markers, but keep every word and punctuation mark.

## Page Information
**URL:** ${pageUrl}
**Title:** ${pageTitle}

## Page Content
${truncatedContent}

Find ${rejectedQuotes.length} NEW verbatim quotes to replace the failed ones. Each quote MUST be an exact copy-paste from the page content above.

Return ONLY a valid JSON object with the replacement quotes array.`;
}
