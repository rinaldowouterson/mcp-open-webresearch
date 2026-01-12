/**
 * CitationExtractor Agent
 *
 * Visits search result URLs, extracts relevant quotes, and assesses source quality.
 * This agent uses LLM to analyze page content and extract citations.
 */

import { visitPage } from "../../../infrastructure/visit_page/visit.js";
import { callLLM } from "../../../infrastructure/callLLM.js";
import { getConfig } from "../../../config/index.js";
import { normalizeUrlForDedup } from "../../../utils/url.js";
import {
  CITATION_EXTRACTOR_SYSTEM_PROMPT,
  buildCitationExtractorUserPrompt,
  buildCitationRetryPrompt,
} from "../prompts/citationExtractor.prompt.js";
import type { MergedSearchResult } from "../../../types/MergedSearchResult.js";
import type { CitationEntry } from "../contextSheet.js";

export interface CitationExtractorResult {
  citations: CitationEntry[];
  visitedUrls: string[];
  failedUrls: string[];
}

interface LLMCitationResponse {
  quality: "HIGH" | "MEDIUM" | "LOW" | "REJECTED";
  qualityNote: string;
  quotes: string[];
}

/**
 * Parse LLM response to extract citation data.
 */
function parseCitationResponse(responseText: string): LLMCitationResponse {
  let jsonText = responseText.trim();

  // Remove markdown code fencing if present
  const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonText);

    // Validate required fields
    const quality = parsed.quality?.toUpperCase() || "LOW";
    const validQualities = ["HIGH", "MEDIUM", "LOW", "REJECTED"];
    const normalizedQuality = validQualities.includes(quality)
      ? (quality as LLMCitationResponse["quality"])
      : "LOW";

    return {
      quality: normalizedQuality,
      qualityNote: parsed.qualityNote || "No quality assessment provided",
      quotes: Array.isArray(parsed.quotes) ? parsed.quotes : [],
    };
  } catch {
    console.debug("[CitationExtractor] Failed to parse JSON response");
    return {
      quality: "REJECTED",
      qualityNote: "Failed to parse LLM response",
      quotes: [],
    };
  }
}

/**
 * Normalize text for verbatim matching.
 * Strips markdown formatting, handles Unicode variants, and normalizes whitespace.
 */
function normalizeForMatching(text: string): string {
  return (
    text
      .toLowerCase() // Case insensitive matching
      // Replace all non-alphanumeric characters (not letters, numbers, or whitespace) with a space
      // Using /u flag for Unicode support (\p{L} = Any Letter, \p{N} = Any Number)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      // Collapse multiple spaces into one and trim
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Verify that a quote exists verbatim in the source text.
 * Returns true if the quote (or a punctuation-flexible variant) is found.
 *
 * @param alternateSource Optional second source (e.g. plain text) to check if primary source (markdown) fails.
 */
function verifyQuoteInSource(
  quote: string,
  sourceText: string,
  alternateSource?: string,
): boolean {
  // 1. Check Primary Source (Markdown)
  if (sourceText.includes(quote)) return true;

  const normalizedQuote = normalizeForMatching(quote);
  const normalizedSource = normalizeForMatching(sourceText);
  if (normalizedSource.includes(normalizedQuote)) return true;

  // 2. Check Alternate Source (Plain Text) if provided
  // This handles cases where markdown links break word adjacency (e.g. "chicken [link] shawarma")
  if (alternateSource) {
    if (alternateSource.includes(quote)) return true;
    const normalizedAlt = normalizeForMatching(alternateSource);
    if (normalizedAlt.includes(normalizedQuote)) return true;
  }

  return false;
}

/**
 * Filter quotes to only include those that exist verbatim in the source.
 * Returns verified quotes and count of rejected quotes.
 */
function filterVerifiedQuotes(
  quotes: string[],
  sourceText: string,
): { verified: string[]; rejectedCount: number } {
  const verified: string[] = [];
  let rejectedCount = 0;

  for (const quote of quotes) {
    if (verifyQuoteInSource(quote, sourceText)) {
      verified.push(quote);
    } else {
      rejectedCount++;
      console.debug(
        `[CitationExtractor] Rejected non-verbatim quote: "${quote}"`,
      );
    }
  }

  return { verified, rejectedCount };
}

/**
 * Filter quotes with full rejection list for retry logic.
 * Returns both verified and rejected quote arrays.
 */
function filterVerifiedQuotesWithRejected(
  quotes: string[],
  sourceText: string,
  alternateSource?: string,
): { verified: string[]; rejected: string[] } {
  const verified: string[] = [];
  const rejected: string[] = [];

  for (const quote of quotes) {
    if (verifyQuoteInSource(quote, sourceText, alternateSource)) {
      verified.push(quote);
    } else {
      rejected.push(quote);
      // Detailed debug logging for rejected quotes
      const normalizedQuote = normalizeForMatching(quote);
      const normalizedSource = normalizeForMatching(sourceText);
      const quoteInNormalized = normalizedSource.includes(normalizedQuote);
      console.debug(
        `[CitationExtractor] Rejected non-verbatim quote: "${quote}"`,
      );
      console.debug(
        `[CitationExtractor] DEBUG - Quote (${quote.length} chars): "${quote}"`,
      );
      console.debug(
        `[CitationExtractor] DEBUG - Normalized quote: "${normalizedQuote}"`,
      );
      console.debug(
        `[CitationExtractor] DEBUG - Quote in normalized source: ${quoteInNormalized}`,
      );
      // Try to find similar text in source
      const searchTerm = quote.slice(0, 30);
      const idx = sourceText.indexOf(searchTerm);
      if (idx >= 0) {
        console.debug(
          `[CitationExtractor] DEBUG - Similar text found at ${idx}: "${sourceText.slice(idx - 20, idx + quote.length + 20)}"`,
        );
      } else {
        console.debug(
          `[CitationExtractor] DEBUG - No similar text found for: "${searchTerm}"`,
        );
      }
    }
  }

  return { verified, rejected };
}

/**
 * Execute the CitationExtractor agent.
 * Visits each URL, extracts content, and uses LLM to find relevant quotes.
 */
export async function executeCitationExtractor(
  results: MergedSearchResult[],
  objective: string,
  maxUrls?: number,
  allCitations: CitationEntry[] = [],
  startingId: number = 1,
  signal?: AbortSignal,
  onProgress?: (batch: { url: string; count: number }[]) => void,
): Promise<CitationExtractorResult> {
  const citations: CitationEntry[] = [];
  const visitedUrls: string[] = [];
  const failedUrls: string[] = [];
  let nextId = startingId;

  // Limit URLs to visit: undefined or -1 = all, positive number = limit
  const urlsToVisit =
    maxUrls === undefined || maxUrls < 0 ? results : results.slice(0, maxUrls);

  console.debug(
    `[CitationExtractor] Processing ${urlsToVisit.length} URLs for citations`,
  );

  // Parallel processing with concurrency limit from configuration
  const CONCURRENCY = getConfig().browser.concurrency;

  // Progress batching: collect citations per URL for batched progress reports
  let progressBatch: { url: string; count: number }[] = [];

  // Helper to process a single URL
  async function processUrl(
    result: MergedSearchResult,
    urlIndex: number,
  ): Promise<{
    citation?: CitationEntry;
    visited: boolean;
    failed: boolean;
    progressItem: { url: string; count: number };
  }> {
    console.debug(
      `[CitationExtractor] [${urlIndex + 1}/${urlsToVisit.length}] Visiting: ${result.url}`,
    );

    try {
      // Visit the page and extract content
      const page = await visitPage(result.url, false);

      console.debug(
        `[CitationExtractor] Got ${page.content.length} chars from "${page.title}"`,
      );

      // Skip empty pages
      if (!page.content || page.content.trim().length < 100) {
        console.debug(
          `[CitationExtractor] Page content too short, skipping LLM analysis`,
        );
        return {
          citation: {
            id: 0, // Will be assigned later
            url: result.url,
            title: page.title || result.title,
            quality: "REJECTED",
            qualityNote: "Page content too short or empty",
            quotes: [],
            rawMarkdown: page.content || "",
          },
          visited: true,
          failed: false,
          progressItem: { url: normalizeUrlForDedup(result.url), count: 0 },
        };
      }

      const existingCitations = allCitations.filter(
        (c) => c.url === result.url,
      );

      if (existingCitations.length > 0) {
        console.debug(
          `[CitationExtractor] Skipping ${result.url} because it has already been visited`,
        );
        return {
          visited: false,
          failed: false,
          progressItem: { url: normalizeUrlForDedup(result.url), count: 0 },
        };
      }

      // Use LLM to extract citations
      const userPrompt = buildCitationExtractorUserPrompt(
        objective,
        result.url,
        page.title || result.title,
        page.content,
        existingCitations,
      );

      const llmResult = await callLLM({
        systemPrompt: CITATION_EXTRACTOR_SYSTEM_PROMPT,
        userPrompt,
        temperature: 0.3,
        maxTokens: 2000,
      });

      console.debug(
        `[CitationExtractor] LLM response via ${llmResult.provider}`,
      );

      const extracted = parseCitationResponse(llmResult.text);

      // Filter quotes to only include those that exist verbatim in the source
      let { verified, rejected } = filterVerifiedQuotesWithRejected(
        extracted.quotes,
        page.content,
        page.textContent,
      );

      // Retry logic: if some quotes were rejected, ask LLM for replacements
      const maxRetries = 2;
      let retryCount = 0;

      while (rejected.length > 0 && retryCount < maxRetries) {
        retryCount++;
        console.debug(
          `[CitationExtractor] Retry ${retryCount}/${maxRetries}: ${rejected.length} quotes need replacement`,
        );

        const retryPrompt = buildCitationRetryPrompt(
          objective,
          result.url,
          page.title || result.title,
          page.content,
          rejected,
          verified,
        );

        const retryResult = await callLLM({
          systemPrompt: CITATION_EXTRACTOR_SYSTEM_PROMPT,
          userPrompt: retryPrompt,
          temperature: 0.2,
          maxTokens: 2000,
        });

        const retryExtracted = parseCitationResponse(retryResult.text);

        const retryVerification = filterVerifiedQuotesWithRejected(
          retryExtracted.quotes,
          page.content,
          page.textContent,
        );

        for (const newQuote of retryVerification.verified) {
          if (!verified.includes(newQuote)) {
            verified.push(newQuote);
          }
        }

        rejected = retryVerification.rejected;

        console.debug(
          `[CitationExtractor] Retry ${retryCount}: ${retryVerification.verified.length} verified, ${rejected.length} still rejected`,
        );

        if (rejected.length === 0) {
          console.debug(
            `[CitationExtractor] ✓ RECTIFIED: All quotes now verified after retry ${retryCount}`,
          );
        }
      }

      if (rejected.length > 0) {
        console.debug(
          `[CitationExtractor] ✗ UNRESOLVED: ${rejected.length} quotes could not be verified after ${maxRetries} retries`,
        );
        for (const failedQuote of rejected) {
          console.debug(`[CitationExtractor]   - FAILED: "${failedQuote}"`);
        }
      }

      console.debug(
        `[CitationExtractor] Extracted ${verified.length} verified quotes (${extracted.quality})`,
      );

      return {
        citation: {
          id: 0, // Will be assigned later
          url: result.url,
          title: page.title || result.title,
          quality: extracted.quality,
          qualityNote: extracted.qualityNote,
          quotes: verified,
          rawMarkdown: page.content,
        },
        visited: true,
        failed: false,
        progressItem: {
          url: normalizeUrlForDedup(result.url),
          count: verified.length,
        },
      };
    } catch (error: any) {
      console.debug(
        `[CitationExtractor] Failed to visit ${result.url}: ${error.message}`,
      );
      return {
        visited: false,
        failed: true,
        progressItem: { url: normalizeUrlForDedup(result.url), count: 0 },
      };
    }
  }

  // Process URLs in batches
  for (
    let batchStart = 0;
    batchStart < urlsToVisit.length;
    batchStart += CONCURRENCY
  ) {
    // Check for cancellation before each batch
    if (signal?.aborted) {
      console.debug(`[CitationExtractor] Cancelled after ${batchStart} URLs`);
      break;
    }

    const batchEnd = Math.min(batchStart + CONCURRENCY, urlsToVisit.length);
    const batch = urlsToVisit.slice(batchStart, batchEnd);

    console.debug(
      `[CitationExtractor] Processing batch ${Math.floor(batchStart / CONCURRENCY) + 1}: URLs ${batchStart + 1}-${batchEnd}`,
    );

    // Process batch in parallel
    const batchResults = await Promise.all(
      batch.map((result, i) => processUrl(result, batchStart + i)),
    );

    // Collect results and send progress for each URL immediately
    for (const res of batchResults) {
      if (res.citation) {
        res.citation.id = nextId++;
        citations.push(res.citation);
      }
      if (res.visited) {
        visitedUrls.push(res.citation?.url || "");
      }
      if (res.failed) {
        failedUrls.push(res.progressItem.url);
      }
      // Send progress notification for EACH URL immediately
      if (onProgress) {
        onProgress([res.progressItem]);
      }
    }
  }

  console.debug(
    `[CitationExtractor] Complete: ${visitedUrls.length} visited, ${failedUrls.length} failed, ${citations.length} citations`,
  );

  return { citations, visitedUrls, failedUrls };
}
