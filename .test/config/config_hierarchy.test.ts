import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getConfig, resetConfigForTesting } from "../../src/config/index.js";
import { ConfigOverrides } from "../../src/types/index.js";

describe("Configuration Hierarchy (Priority) Test", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should prioritize CLI Overrides > Env Vars > Defaults", () => {
    // 1. Set Env Var
    process.env.DEEP_SEARCH_MAX_LOOPS = "25";
    process.env.BROWSER_CONCURRENCY = "2";

    // 2. Set CLI Override (should win)
    const overrides: ConfigOverrides = {
      deepSearch: {
        maxLoops: 50,
      },
      // Browser concurrency NOT in override, should take Env Var
    };

    resetConfigForTesting(false, overrides);
    const config = getConfig();

    expect(config.deepSearch.maxLoops).toBe(50); // CLI won
    expect(config.browser.concurrency).toBe(2); // Env Var used
    expect(config.deepSearch.resultsPerEngine).toBe(5); // Default used
  });

  it("should correctly handle nested object overrides", () => {
    const overrides: ConfigOverrides = {
      llm: {
        baseUrl: "http://cli-llm",
        timeoutMs: 1000,
      },
      browser: {
        idleTimeout: 300,
      },
    };

    resetConfigForTesting(false, overrides);
    const config = getConfig();

    expect(config.llm.baseUrl).toBe("http://cli-llm");
    expect(config.llm.timeoutMs).toBe(1000);
    expect(config.browser.idleTimeout).toBe(300);
    // Ensure nested defaults are preserved
    expect(config.browser.concurrency).toBe(4);
  });

  it("should handle boolean flag overrides correctly (skipCooldown)", () => {
    process.env.SKIP_COOLDOWN = "false";
    resetConfigForTesting(false, { skipCooldown: true });
    expect(getConfig().skipCooldown).toBe(true);

    resetConfigForTesting(false, { skipCooldown: false });
    expect(getConfig().skipCooldown).toBe(false);
  });

  it("should handle SSL ignoreTlsErrors override", () => {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "1";
    resetConfigForTesting(false, { ssl: { ignoreTlsErrors: true } });
    expect(getConfig().ssl.ignoreTlsErrors).toBe(true);
  });
});
