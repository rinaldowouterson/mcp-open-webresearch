/**
 * Creates a standardized response
 */

export const createResponse = (text: string, isError = false) => ({
  content: [
    {
      type: "text" as const,
      text: text,
    },
  ],
  ...(isError && { isError: true }),
});
