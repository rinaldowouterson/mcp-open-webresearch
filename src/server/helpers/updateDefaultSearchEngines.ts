import fs from "fs/promises";
import path from "path";
import { SUPPORTED_ENGINES } from "../../types/index.js";
import { createResponse } from "./createResponse.js";
import dotenv from "dotenv";

/**
 * Updates default search engines in config and persists to .env file
 */
export const updateDefaultSearchEngines = async (engines: string[]) => {
  const validEngines = SUPPORTED_ENGINES.filter((engine) =>
    engines.includes(engine)
  );

  if (validEngines.length === 0) {
    return createResponse("No valid search engines provided", true);
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
          `DEFAULT_SEARCH_ENGINES=${validEngines.join(",")}`
        );
      } else {
        envContents += `\nDEFAULT_SEARCH_ENGINES=${validEngines.join(",")}\n`;
      }
    } else {
      envContents = `DEFAULT_SEARCH_ENGINES=${validEngines.join(",")}\n`;
    }

    await fs.writeFile(envPath, envContents);
    Object.assign(process.env, dotenv.parse(envContents));

    return createResponse(
      `Updated default engines to: ${validEngines.join(
        ", "
      )} and persisted to .env`
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return createResponse(`Failed to update defaults: ${errorMessage}`, true);
  }
};
