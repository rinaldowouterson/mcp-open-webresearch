import { createHash, randomBytes } from "node:crypto";

/**
 * Generates a random, hard-to-guess identifier based on the current timestamp and a random salt.
 * @returns A SHA-256 hash string.
 */
export function generateDownloadId(): string {
  const salt = randomBytes(16).toString("hex");
  const timestamp = Date.now().toString();
  return createHash("sha256")
    .update(timestamp + salt)
    .digest("hex");
}
