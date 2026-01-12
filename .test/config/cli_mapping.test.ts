import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseCliArgs } from "../../src/utils/cli.js";
import { program } from "commander";

// Mock commander
vi.mock("commander", () => {
  let options: Record<string, any> = {};
  const program = {
    option: vi.fn().mockReturnThis(),
    parse: vi.fn().mockReturnThis(),
    opts: vi.fn(() => options),
  };
  return { program };
});

describe("CLI Mapping Unit Test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should map all arguments correctly into ConfigOverrides", () => {
    const mockOpts = {
      port: "4000",
      debug: true,
      debugFile: true,
      logPath: "/tmp/test.log",
      cors: true,
      corsOrigin: "http://example.com",
      proxy: "http://proxy:8080",
      engines: ["bing", "brave"],
      sampling: true,
      skipCooldown: true,
      ignoreTls: true,
      dsMaxLoops: 50,
      dsResultsPerEngine: 20,
      dsSaturation: 0.8,
      dsMaxCitations: 15,
      dsRetention: 30,
      browserConcurrency: 8,
      browserTimeout: 60000,
      screenshotMaxSize: 1048576,
      llmBaseUrl: "http://llm:11434",
      llmApiKey: "secret",
      llmModel: "gpt-4",
      llmTimeout: 45000,
      retryDelays: [1000, 2000],
      skipIdeSampling: true,
      dnsRebinding: true,
      allowedHosts: ["host1", "host2"],
    };

    // Simulate commander options
    vi.mocked(program.opts).mockReturnValue(mockOpts);

    const overrides = parseCliArgs();

    expect(overrides.port).toBe(4000);
    expect(overrides.debug).toBe(true);
    expect(overrides.logPath).toBe("/tmp/test.log");
    expect(overrides.corsOrigin).toBe("http://example.com");
    expect(overrides.proxyUrl).toBe("http://proxy:8080");
    expect(overrides.engines).toEqual(["bing", "brave"]);
    expect(overrides.skipCooldown).toBe(true);
    expect(overrides.ssl?.ignoreTlsErrors).toBe(true);

    // DeepSearch
    expect(overrides.deepSearch?.maxLoops).toBe(50);
    expect(overrides.deepSearch?.saturationThreshold).toBe(0.8);

    // Browser
    expect(overrides.browser?.concurrency).toBe(8);
    expect(overrides.browser?.screenshotMaxSize).toBe(1048576);

    // LLM
    expect(overrides.llm?.baseUrl).toBe("http://llm:11434");
    expect(overrides.llm?.retryDelays).toEqual([1000, 2000]);
    expect(overrides.llm?.skipIdeSampling).toBe(true);

    // Security
    expect(overrides.security?.enableDnsRebindingProtection).toBe(true);
    expect(overrides.security?.allowedHosts).toEqual(["host1", "host2"]);
  });
});
