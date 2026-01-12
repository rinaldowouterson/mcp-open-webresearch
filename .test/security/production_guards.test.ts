import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetConfigForTesting } from "../../src/config/index.js";
import { resetProductionCacheForTesting } from "../../src/server/helpers/ephemeralBufferCache.js";

describe("Production Safety Guards", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("should throw error when resetConfigForTesting is called in production", () => {
    process.env.NODE_ENV = "production";

    expect(() => {
      resetConfigForTesting();
    }).toThrow(
      "CRITICAL: resetConfigForTesting called in PRODUCTION environment!",
    );
  });

  it("should throw error when resetProductionCacheForTesting is called in production", () => {
    process.env.NODE_ENV = "production";

    expect(() => {
      resetProductionCacheForTesting();
    }).toThrow(
      "CRITICAL: resetProductionCacheForTesting called in PRODUCTION environment!",
    );
  });

  it("should allow execution when NOT in production", () => {
    process.env.NODE_ENV = "test";

    // Should not throw
    expect(() => resetConfigForTesting()).not.toThrow();
    expect(() => resetProductionCacheForTesting()).not.toThrow();
  });
});
