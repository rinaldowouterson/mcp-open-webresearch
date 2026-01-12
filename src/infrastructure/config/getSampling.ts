import { getConfig } from "../../config/index.js";

/**
 * Gets the current sampling setting from config.
 * Defaults to false if not set (sampling requires LLM configuration).
 */
export const getSampling = (): boolean => {
  return getConfig().llm.samplingAllowed;
};

/**
 * Returns the current sampling configuration status
 */
export const getSamplingStatus = () => {
  const config = getConfig();
  return {
    sampling: config.llm.samplingAllowed,
    llm_available: config.llm.apiSamplingAvailable,
    ide_supports_sampling: config.llm.ideSupportsSampling,
    llm_model: config.llm.model,
  };
};
