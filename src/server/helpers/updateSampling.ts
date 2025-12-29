import fs from "fs/promises";
import path from "path";
import { createResponse } from "./createResponse.js";

/**
 * Updates sampling setting in config and persists to .env file
 */
export const updateSampling = async (enabled: boolean) => {
  const envPath = path.join(process.cwd(), ".env");

  try {
    let envContents = "";
    const envExists = await fs
      .access(envPath)
      .then(() => true)
      .catch(() => false);

    if (envExists) {
      envContents = await fs.readFile(envPath, "utf-8");

      if (envContents.includes("SAMPLING=")) {
        envContents = envContents.replace(
          /SAMPLING=.*/,
          `SAMPLING=${enabled}`
        );
      } else {
        envContents += `\nSAMPLING=${enabled}\n`;
      }
    } else {
      envContents = `SAMPLING=${enabled}\n`;
    }

    await fs.writeFile(envPath, envContents);
    process.env.SAMPLING = String(enabled);

    return createResponse(
      `Sampling ${enabled ? "enabled" : "disabled"} and persisted to .env`
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return createResponse(`Failed to update sampling: ${errorMessage}`, true);
  }
};
