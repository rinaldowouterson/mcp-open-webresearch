/**
 * Prompt template for LLM-based relevance evaluation of search results.
 * Used by the sampling filter to determine which results are relevant to the query.
 */
export const buildSamplingPrompt = (
  query: string,
  formattedResults: string,
): string => {
  return `You are evaluating search results for relevance and quality.

Query: "${query}"

Evaluate these search results and return ONLY the indices of relevant, high-quality results as comma-separated numbers:

${formattedResults}

Rules:
- Return ONLY comma-separated numbers (e.g., "1,3,5,7")
- Exclude: spam, unrelated content, low-quality pages
- If no results are relevant, respond with "none"

Your response (comma-separated indices only):`;
};
