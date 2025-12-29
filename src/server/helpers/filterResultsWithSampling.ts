import { SearchResult } from "../../types/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface SamplingFilterOptions {
  query: string;
  results: SearchResult[];
  maxResults: number;
  server: McpServer;
}

/**
 * Formats search results as a numbered list for LLM evaluation
 */
const formatResultsForEvaluation = (results: SearchResult[]): string => {
  return results
    .map(
      (result, index) =>
        `${index + 1}. [${result.title}] (${result.source}) - ${
          result.description
        }`
    )
    .join("\n");
};

/**
 * Parses the LLM response to extract approved result indices
 * Expects comma-separated numbers like "1,3,5,7"
 */
const parseApprovedIndices = (response: string): number[] => {
  if (!response) return [];

  const results: number[] = [];

  // Find the first numeric sequence
  const firstMatch = response.match(/\d+/);
  if (!firstMatch) return [];

  results.push(parseInt(firstMatch[0], 10));

  let remainingText = response.slice(firstMatch.index! + firstMatch[0].length);

  // Iteratively look for next numbers separated by valid delimiters (comma, and, &, or spaces)
  // Stops as soon as the delimiter pattern is broken or followed by non-digits
  const nextPattern = /^[\s,]*\s*(?:and|&)?\s*(\d+)/i;

  while (remainingText) {
    const match = remainingText.match(nextPattern);
    if (match) {
      results.push(parseInt(match[1], 10));
      remainingText = remainingText.slice(match[0].length);
    } else {
      break;
    }
  }

  return results
    .map((num) => num - 1) // Convert to 0-indexed
    .filter((index) => index >= 0);
};

/**
 * Internal helper: Call OpenRouter/OpenAI Compatible API directly
 * Bypasses the MCP Client Sampling Protocol
 */
const fetchDirectInference = async (prompt: string): Promise<string> => {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
  const model = process.env.OPENAI_MODEL || "google/gemini-2.0-flash-001"; // Fallback model

  if (!apiKey) throw new Error("No API Key available for direct inference");

  console.debug(`[Sampling] Bypassing client. Using direct API: ${model}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant evaluating search results.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0, // Deterministic for filtering
      }),
      signal: controller.signal,
    });

    const responseTextRaw = await response.text();

    if (!response.ok) {
      throw new Error(`Inference API Error (${response.status}): ${responseTextRaw}`);
    }

    const data = JSON.parse(responseTextRaw);
    const content = data.choices?.[0]?.message?.content || "";
    return content;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Check if the client supports sampling capability
 */
export const clientSupportsSampling = (server: McpServer): boolean => {
  const capabilities = server.server.getClientCapabilities();
  return !!capabilities?.sampling;
};

/**
 * Filters search results using a Hybrid Strategy:
 * 1. Checks for OPENAI_API_KEY to bypass client limitations (AntiGravity Fix).
 * 2. Falls back to MCP Protocol Sampling if no key is present.
 * 3. Returns unfiltered results if both fail.
 */
export const filterResultsWithSampling = async (
  options: SamplingFilterOptions
): Promise<SearchResult[]> => {
  const { query, results, maxResults, server } = options;

  if (results.length === 0) return [];

  // Prepare the prompt once
  const formattedResults = formatResultsForEvaluation(results);
  const prompt = `You are evaluating search results for relevance and quality.

Query: "${query}"

Evaluate these search results and return ONLY the indices of relevant, high-quality results as comma-separated numbers:

${formattedResults}

Rules:
- Return ONLY comma-separated numbers (e.g., "1,3,5,7")
- Exclude: spam, unrelated content, low-quality pages
- If no results are relevant, respond with "none"

Your response (comma-separated indices only):`;

  let responseText = "";

  try {
    // --- STRATEGY A: DIRECT API (BYPASS) ---
    if (process.env.OPENAI_API_KEY) {
      try {
        responseText = await fetchDirectInference(prompt);
      } catch (directError: any) {
        console.debug(`[Sampling] Direct API attempt skipped or failed: ${directError.message}`);
        // Do not return here; allow fall-through to Strategy B
      }
    }

    // --- STRATEGY B: MCP CLIENT PROTOCOL ---
    if (!responseText) {
      if (!clientSupportsSampling(server)) {
        console.debug("[Sampling] Strategy: No local API key and client lacks sampling support. Using raw results.");
        return results.slice(0, maxResults); // Fail-safe
      }

      console.debug("[Sampling] Strategy: Using MCP Protocol sampling...");
      const response = await server.server.createMessage({
        messages: [{ role: "user", content: { type: "text", text: prompt } }],
        maxTokens: 100,
      });

      responseText =
        response.content.type === "text" ? response.content.text : "";
    }

    // --- PROCESSING RESPONSE ---
    console.debug(`[Sampling] Decision received: ${responseText}`);

    if (responseText.toLowerCase().includes("none")) {
      return [];
    }

    const approvedIndices = parseApprovedIndices(responseText);

    if (approvedIndices.length === 0) {
      console.debug("[Sampling] Warning: No valid indices parsed. Returning unfiltered.");
      return results.slice(0, maxResults);
    }

    const filteredResults = approvedIndices
      .filter((index) => index < results.length)
      .map((index) => results[index])
      .slice(0, maxResults);

    console.debug(`[Sampling] Filtered down to ${filteredResults.length} results.`);
    return filteredResults;

  } catch (error) {
    console.debug("[Sampling] Fatal error during filtering:", error);
    return results.slice(0, maxResults);
  }
};
