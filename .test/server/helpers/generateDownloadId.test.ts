import { describe, it, expect } from "vitest";
import { generateDownloadId } from "../../../src/server/helpers/generateDownloadId.js";

describe("generateDownloadId", () => {
  it("should generate a non-empty string", () => {
    const id = generateDownloadId();
    expect(id).toBeDefined();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("should generate unique IDs", () => {
    const id1 = generateDownloadId();
    const id2 = generateDownloadId();
    expect(id1).not.toBe(id2);
  });

  it("should correspond to SHA-256 hex length (64 chars)", () => {
    const id = generateDownloadId();
    expect(id).toMatch(/^[a-f0-9]{64}$/);
  });
});
