import { createResponse } from "./createResponse.js";
import { getConfig } from "../../config/index.js";

/**
 * Gets the current sampling setting from config.
 * Defaults to false if not set (sampling requires LLM configuration).
 */
export const getSampling = (): boolean => {
  return getConfig().llm.samplingAllowed;
};

/**
 * Returns a formatted response with the current sampling status
 */
export const getSamplingResponse = () => {
  const config = getConfig();
  return createResponse(
    JSON.stringify(
      {
        sampling: config.llm.samplingAllowed,
        llm_available: config.llm.apiSamplingAvailable,
        ide_supports_sampling: config.llm.ideSupportsSampling,
        llm_model: config.llm.model,
      },
      null,
      2,
    ),
  );
};
