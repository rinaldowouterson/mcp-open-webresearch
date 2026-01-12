import fs from "fs/promises";
import path from "path";
import { getEngineNames } from "../search/registry.js";
import { updateDefaultSearchEngines as updateConfig } from "../../config/index.js";

/**
 * Updates default search engines in config and persists to .env file
 */
export const updateDefaultSearchEngines = async (
  engines: string[],
): Promise<void> => {
  const supportedEngines = await getEngineNames();
  const validEngines = engines.filter((e) => supportedEngines.includes(e));

  if (validEngines.length === 0) {
    throw new Error(
      `No valid search engines provided. Available: ${supportedEngines.join(", ")}`,
    );
  }

  const envPath = path.join(process.cwd(), ".env");

  try {
    let envContents = "";
    const envExists = await fs
      .access(envPath)
      .then(() => true)
      .catch(() => false);

    if (envExists) {
      envContents = await fs.readFile(envPath, "utf-8");

      if (envContents.includes("DEFAULT_SEARCH_ENGINES=")) {
        envContents = envContents.replace(
          /DEFAULT_SEARCH_ENGINES=.*/,
          `DEFAULT_SEARCH_ENGINES=${validEngines.join(",")}`,
        );
      } else {
        envContents += `\nDEFAULT_SEARCH_ENGINES=${validEngines.join(",")}\n`;
      }
    } else {
      envContents = `DEFAULT_SEARCH_ENGINES=${validEngines.join(",")}\n`;
    }

    await fs.writeFile(envPath, envContents);
    // Update runtime config
    updateConfig(validEngines);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to update defaults: ${errorMessage}`);
  }
};
