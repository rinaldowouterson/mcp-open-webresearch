/**
 * Centralized LLM Calling Utility
 *
 * Single source of truth for all LLM calls in the codebase.
 * Implements the tiered resolution logic documented in README.md:
 *
 * | SKIP_IDE_SAMPLING | IDE Available | API Configured | Resolution       |
 * | ----------------- | ------------- | -------------- | ---------------- |
 * | `false` (default) | ✅            | ✅             | **IDE Sampling** |
 * | `true`            | ✅            | ❌             | **IDE Sampling** |
 * | `false`           | ❌            | ✅             | **External API** |
 * | `true`            | ✅ OR ❌      | ✅             | **External API** |
 * | `false` OR `true` | ❌            | ❌             | No Sampling      |
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getConfig } from "../config/index.js";
import { smartPost } from "./fetch/client.js";
import { mcpServer } from "./bootstrap/instance.js";

export interface LLMCallOptions {
  /** System prompt / instruction */
  systemPrompt: string;
  /** User prompt / content to process */
  userPrompt: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for generation (0-1) */
  temperature?: number;
}

export interface LLMCallResult {
  /** The LLM's response text */
  text: string;
  /** Which provider was used */
  provider: "ide" | "api" | "none";
}

/**
 * Call LLM via direct API (OpenAI-compatible endpoint).
 */
async function callDirectApi(options: LLMCallOptions): Promise<string> {
  const config = getConfig();
  const { baseUrl, apiKey, model, timeoutMs } = config.llm;

  if (!baseUrl || !model) {
    throw new Error("LLM not configured: baseUrl and model required");
  }

  console.debug(`[LLM] Using direct API: ${model} at ${baseUrl}`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`LLM timeout after ${timeoutMs}ms`)),
      timeoutMs,
    ),
  );

  const fetchPromise = smartPost(`${baseUrl}/chat/completions`, {
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: options.systemPrompt },
        { role: "user", content: options.userPrompt },
      ],
      temperature: options.temperature ?? 0,
      max_tokens: options.maxTokens ?? 1000,
    }),
  });

  const response = await Promise.race([fetchPromise, timeoutPromise]);
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`LLM API Error (${response.status}): ${responseText}`);
  }

  const data = JSON.parse(responseText);
  return data.choices?.[0]?.message?.content || "";
}

/**
 * Call LLM via MCP IDE sampling (server.createMessage).
 */
async function callIdeSampling(
  server: McpServer,
  options: LLMCallOptions,
): Promise<string> {
  console.debug("[LLM] Using IDE sampling...");

  // Combine system and user prompts for IDE sampling
  // (IDE sampling doesn't have separate system prompt in MCP protocol)
  const combinedPrompt = `${options.systemPrompt}\n\n${options.userPrompt}`;

  const response = await server.server.createMessage({
    messages: [
      {
        role: "user",
        content: { type: "text", text: combinedPrompt },
      },
    ],
    maxTokens: options.maxTokens ?? 1000,
  });

  return response.content.type === "text" ? response.content.text : "";
}

/**
 * Call LLM using the tiered resolution strategy with retry logic.
 */
export async function callLLM(
  options: LLMCallOptions,
  server?: McpServer,
): Promise<LLMCallResult> {
  const { llm } = getConfig();
  const retryDelays = llm.retryDelays;
  const effectiveServer = server || mcpServer;

  if (!llm.samplingAllowed) {
    throw new Error(
      "No LLM available: neither IDE sampling nor external API configured",
    );
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    try {
      return await executeLLMStrategy(options, effectiveServer);
    } catch (error: any) {
      lastError = error;

      // Determine if retry is possible
      if (attempt < retryDelays.length) {
        const delay = retryDelays[attempt];
        console.warn(
          `[LLM] Call failed: ${error.message}. Retrying in ${
            delay / 1000
          }s... (Attempt ${attempt + 1}/${retryDelays.length})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `All LLM attempts failed after ${retryDelays.length} retries. Last error: ${lastError?.message}`,
  );
}

/**
 * Internal execution of the LLM strategy (Primary + Fallback).
 */
async function executeLLMStrategy(
  options: LLMCallOptions,
  server: McpServer,
): Promise<LLMCallResult> {
  const { llm } = getConfig();
  let responseText = "";
  let provider: LLMCallResult["provider"] = "none";
  let primaryError: Error | null = null;

  try {
    if (llm.useApiFirst) {
      // User prefers API
      console.debug("[LLM] Using direct API (SKIP_IDE_SAMPLING=true)...");
      provider = "api";
      responseText = await callDirectApi(options);
    } else if (llm.useIdeFirst) {
      // User prefers IDE (default)
      console.debug("[LLM] Using IDE sampling (default)...");
      provider = "ide";
      responseText = await callIdeSampling(server, options);
    } else if (llm.ideSelectedButApiAvailable) {
      // IDE was selected but unavailable, fall through to API
      console.debug("[LLM] IDE unavailable, using API fallback...");
      provider = "api";
      responseText = await callDirectApi(options);
    } else if (llm.apiSelectedButIdeAvailable) {
      // API was selected but unavailable, fall through to IDE
      console.debug("[LLM] API unavailable, using IDE fallback...");
      provider = "ide";
      responseText = await callIdeSampling(server, options);
    }
  } catch (error: any) {
    primaryError = error;
    console.debug(`[LLM] Primary strategy failed: ${error.message}`);
  }

  // Attempt fallback if primary failed
  if (primaryError && !responseText) {
    try {
      if (provider === "api" && llm.ideSupportsSampling) {
        console.debug("[LLM] Falling back to IDE sampling...");
        responseText = await callIdeSampling(server, options);
        provider = "ide";
      } else if (provider === "ide" && llm.apiSamplingAvailable) {
        console.debug("[LLM] Falling back to direct API...");
        responseText = await callDirectApi(options);
        provider = "api";
      } else {
        throw primaryError;
      }
    } catch (fallbackError: any) {
      throw new Error(
        `All LLM strategies failed. Primary: ${primaryError.message}, Fallback: ${fallbackError.message}`,
      );
    }
  }

  if (!responseText) {
    throw new Error("LLM returned empty response");
  }

  console.debug(`[LLM] Response received via ${provider}`);
  return { text: responseText, provider };
}

/**
 * Check if any LLM is available for sampling.
 * Uses the pre-computed samplingAllowed from config.
 */
export function isLLMAvailable(): boolean {
  return getConfig().llm.samplingAllowed;
}
