import { createResponse } from "./createResponse.js";

/**
 * Gets the current sampling setting from environment
 * Defaults to true if not set
 */
export const getSampling = (): boolean => {
  const samplingEnv = process.env.SAMPLING;
  // Default to true if not set
  if (samplingEnv === undefined || samplingEnv === "") {
    return true;
  }
  return samplingEnv.toLowerCase() === "true";
};

/**
 * Returns a formatted response with the current sampling status
 */
export const getSamplingResponse = () => {
  return createResponse(
    JSON.stringify({ sampling: getSampling() }, null, 2)
  );
};
