import { MergedSearchResult } from "../../types/MergedSearchResult.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadConfig } from "../../config/index.js";
import { buildSamplingPrompt } from "../../prompts/index.js";
import { SamplingFilterOptions } from "../../types/SamplingFilterOptions.js";

/**
 * Formats search results as a numbered list for LLM evaluation
 */
const formatResultsForEvaluation = (results: MergedSearchResult[]): string => {
  return results
    .map(
      (result, index) =>
        `${index + 1}. [${result.title}] (${result.engines.join(", ")}) - ${
          result.description
        }`,
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

  // Iteratively look for next numbers separated by valid delimiters
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
 * Calls an OpenAI-compatible API directly.
 * Uses config.llm for all settings (baseUrl, apiKey, model, timeout).
 */
const fetchDirectInference = async (prompt: string): Promise<string> => {
  const config = loadConfig();
  const { baseUrl, apiKey, model, timeoutMs } = config.llm;

  if (!baseUrl || !model) {
    throw new Error("LLM not configured: baseUrl and model are required");
  }

  console.debug(`[Sampling] Using direct API: ${model} at ${baseUrl}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Only add Authorization header if API key is provided
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant evaluating search results.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0,
      }),
      signal: controller.signal,
    });

    const responseTextRaw = await response.text();

    if (!response.ok) {
      throw new Error(
        `Inference API Error (${response.status}): ${responseTextRaw}`,
      );
    }

    const data = JSON.parse(responseTextRaw);
    return data.choices?.[0]?.message?.content || "";
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Check if the client supports MCP sampling capability
 */
export const clientSupportsSampling = (server: McpServer): boolean => {
  const capabilities = server.server.getClientCapabilities();
  return !!capabilities?.sampling;
};

/**
 * Filters search results using LLM-based relevance evaluation.
 *
 * Strategy priority:
 * 1. If skipIdeSampling=true AND external LLM is available: use direct API only
 * 2. If skipIdeSampling=false: try IDE sampling first, fallback to direct API
 * 3. Fallback to unfiltered results if neither works
 */
export const filterResultsWithSampling = async (
  options: SamplingFilterOptions,
): Promise<MergedSearchResult[]> => {
  const { query, results, maxResults, server } = options;
  if (results.length === 0) return [];

  const config = loadConfig();
  // Build the prompt
  const formattedResults = formatResultsForEvaluation(results);
  const prompt = buildSamplingPrompt(query, formattedResults);

  let responseText = "";
  const skipIdeSampling = config.llm.skipIdeSampling;
  const ideAvailable = clientSupportsSampling(server);
  const apiAvailable = config.llm.isAvailable;

  try {
    // Determine strategy based on skipIdeSampling preference
    if (skipIdeSampling && apiAvailable) {
      // User explicitly wants to skip IDE sampling
      console.debug("[Sampling] SKIP_IDE_SAMPLING=true, using direct API...");
      try {
        responseText = await fetchDirectInference(prompt);
      } catch (directError: any) {
        console.debug(`[Sampling] Direct API failed: ${directError.message}`);
        // Graceful degradation to IDE if available
        if (ideAvailable) {
          console.debug("[Sampling] Falling back to IDE sampling...");
          const response = await server.server.createMessage({
            messages: [
              { role: "user", content: { type: "text", text: prompt } },
            ],
            maxTokens: 100,
          });
          responseText =
            response.content.type === "text" ? response.content.text : "";
        } else {
          console.debug("[Sampling] No fallback available. Using raw results.");
          return results.slice(0, maxResults);
        }
      }
    } else if (!skipIdeSampling && ideAvailable) {
      // Prefer IDE sampling (default behavior)
      console.debug("[Sampling] Using MCP Protocol sampling...");
      const response = await server.server.createMessage({
        messages: [{ role: "user", content: { type: "text", text: prompt } }],
        maxTokens: 100,
      });
      responseText =
        response.content.type === "text" ? response.content.text : "";
    } else if (apiAvailable) {
      // IDE not available but API is
      console.debug("[Sampling] IDE not available, using direct API...");
      try {
        responseText = await fetchDirectInference(prompt);
      } catch (directError: any) {
        console.debug(`[Sampling] Direct API failed: ${directError.message}`);
      }
    }

    // Final fallback check
    if (!responseText) {
      if (!ideAvailable && !apiAvailable) {
        console.debug(
          "[Sampling] No LLM available and client lacks sampling. Using raw results.",
        );
        return results.slice(0, maxResults);
      }
      // Try IDE as last resort if not yet tried
      if (ideAvailable && !skipIdeSampling) {
        console.debug("[Sampling] Using MCP Protocol sampling...");
        const response = await server.server.createMessage({
          messages: [{ role: "user", content: { type: "text", text: prompt } }],
          maxTokens: 100,
        });
        responseText =
          response.content.type === "text" ? response.content.text : "";
      }
    }

    // --- PROCESS RESPONSE ---
    console.debug(`[Sampling] Decision received: ${responseText}`);

    if (responseText.toLowerCase().includes("none")) {
      return [];
    }

    const approvedIndices = parseApprovedIndices(responseText);

    if (approvedIndices.length === 0) {
      console.debug(
        "[Sampling] No valid indices parsed. Returning unfiltered.",
      );
      return results.slice(0, maxResults);
    }

    const filteredResults = approvedIndices
      .filter((index) => index < results.length)
      .map((index) => results[index])
      .slice(0, maxResults);

    console.debug(`[Sampling] Filtered to ${filteredResults.length} results.`);
    return filteredResults;
  } catch (error) {
    console.debug("[Sampling] Fatal error during filtering:", error);
    return results.slice(0, maxResults);
  }
};
