import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getSampling } from "../../src/server/helpers/getSampling.js";
import { getConfig, resetConfigForTesting } from "../../src/config/index.js";

// Mock fs to prevent file operations during tests
vi.mock("fs/promises", async () => {
  return {
    default: {
      access: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(""),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe("Sampling Configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear all LLM-related env vars
    delete process.env.SAMPLING;
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_NAME;
    delete process.env.LLM_TIMEOUT_MS;
    delete process.env.SKIP_IDE_SAMPLING;
    // Initialize LLM config singleton
    resetConfigForTesting();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("getSampling", () => {
    it("should return false when SAMPLING env is not set (new default)", () => {
      expect(getSampling()).toBe(false);
    });

    it("should return false when SAMPLING is empty string", () => {
      process.env.SAMPLING = "";
      expect(getSampling()).toBe(false);
    });

    it("should return true when SAMPLING is 'true'", () => {
      process.env.SAMPLING = "true";
      process.env.LLM_BASE_URL = "http://localhost:11434/v1";
      process.env.LLM_NAME = "llama3.2";
      resetConfigForTesting();
      expect(getSampling()).toBe(true);
    });

    it("should return true when SAMPLING is 'TRUE' (case insensitive)", () => {
      process.env.SAMPLING = "TRUE";
      process.env.LLM_BASE_URL = "http://localhost:11434/v1";
      process.env.LLM_NAME = "llama3.2";
      resetConfigForTesting();
      expect(getSampling()).toBe(true);
    });

    it("should return false when SAMPLING is 'false'", () => {
      process.env.SAMPLING = "false";
      expect(getSampling()).toBe(false);
    });

    it("should return false when SAMPLING is any non-true value", () => {
      process.env.SAMPLING = "disabled";
      expect(getSampling()).toBe(false);
    });
  });

  describe("LlmConfig in getConfig", () => {
    it("should have llm.apiSamplingAvailable = false when no LLM env vars set", () => {
      const config = getConfig();
      expect(config.llm.apiSamplingAvailable).toBe(false);
      expect(config.llm.samplingAllowed).toBe(false);
      expect(config.llm.baseUrl).toBeNull();
      expect(config.llm.apiKey).toBeNull();
      expect(config.llm.model).toBeNull();
    });

    it("should have llm.apiSamplingAvailable = false when only baseUrl is set (model required)", () => {
      process.env.LLM_BASE_URL = "http://localhost:11434/v1";
      resetConfigForTesting();
      const config = getConfig();
      expect(config.llm.apiSamplingAvailable).toBe(false);
      expect(config.llm.baseUrl).toBe("http://localhost:11434/v1");
    });

    it("should have llm.apiSamplingAvailable = false when only model is set (baseUrl required)", () => {
      process.env.LLM_NAME = "llama3.2";
      resetConfigForTesting();
      const config = getConfig();
      expect(config.llm.apiSamplingAvailable).toBe(false);
      expect(config.llm.model).toBe("llama3.2");
    });

    it("should have llm.apiSamplingAvailable = true when baseUrl AND model are set (apiKey optional)", () => {
      process.env.LLM_BASE_URL = "http://localhost:11434/v1";
      process.env.LLM_NAME = "llama3.2";
      resetConfigForTesting();
      const config = getConfig();
      expect(config.llm.apiSamplingAvailable).toBe(true);
      expect(config.llm.apiKey).toBeNull(); // Optional
    });

    it("should have llm.apiSamplingAvailable = true with full cloud config", () => {
      process.env.LLM_BASE_URL = "https://openrouter.ai/api/v1";
      process.env.LLM_API_KEY = "sk-test-key";
      process.env.LLM_NAME = "google/gemini-2.0-flash-001";
      resetConfigForTesting();
      const config = getConfig();
      expect(config.llm.apiSamplingAvailable).toBe(true);
      expect(config.llm.baseUrl).toBe("https://openrouter.ai/api/v1");
      expect(config.llm.apiKey).toBe("sk-test-key");
      expect(config.llm.model).toBe("google/gemini-2.0-flash-001");
    });

    it("should use default timeout of 30000ms when LLM_TIMEOUT_MS not set", () => {
      const config = getConfig();
      expect(config.llm.timeoutMs).toBe(30000);
    });

    it("should parse custom LLM_TIMEOUT_MS", () => {
      process.env.LLM_TIMEOUT_MS = "15000";
      resetConfigForTesting();
      const config = getConfig();
      expect(config.llm.timeoutMs).toBe(15000);
    });

    it("should set llm.samplingAllowed = true when SAMPLING=true and LLM available", () => {
      process.env.SAMPLING = "true";
      process.env.LLM_BASE_URL = "http://localhost:11434/v1";
      process.env.LLM_NAME = "llama3.2";
      resetConfigForTesting();
      const config = getConfig();
      expect(config.llm.samplingAllowed).toBe(true);
    });
  });
});

describe("filterResultsWithSampling", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.SAMPLING;
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_NAME;
    delete process.env.SKIP_IDE_SAMPLING;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("should import filterResultsWithSampling without error", async () => {
    const { resetConfigForTesting: resetConfig } =
      await import("../../src/config/index.js");
    resetConfig();
    const module =
      await import("../../src/server/helpers/filterResultsWithSampling.js");
    expect(module.filterResultsWithSampling).toBeDefined();
    // clientSupportsSampling was moved to config/index.ts
  });

  it("should filter results using MCP Protocol when LLM not available", async () => {
    // Enable sampling and IDE support
    process.env.SAMPLING = "true";

    // Must dynamically import after vi.resetModules()
    const { resetConfigForTesting: resetConfig } =
      await import("../../src/config/index.js");
    resetConfig(true); // IDE supports sampling

    const { filterResultsWithSampling } =
      await import("../../src/server/helpers/filterResultsWithSampling.js");

    const consoleDebugSpy = vi.spyOn(console, "debug");

    // Mock MergedSearchResult (new type)
    const mockResults = [
      {
        urlHash: "hash1",
        url: "http://1.com",
        title: "Result 1",
        description: "Desc 1",
        engines: ["bing"],
        ranks: [1],
        consensusScore: 1.0,
      },
      {
        urlHash: "hash2",
        url: "http://2.com",
        title: "Result 2",
        description: "Desc 2",
        engines: ["bing", "brave"],
        ranks: [2, 1],
        consensusScore: 2.5,
      },
      {
        urlHash: "hash3",
        url: "http://3.com",
        title: "Result 3",
        description: "Desc 3",
        engines: ["brave"],
        ranks: [3],
        consensusScore: 0.33,
      },
    ];

    const mockSdkServer = {
      getClientCapabilities: vi.fn().mockReturnValue({ sampling: {} }),
      createMessage: vi.fn().mockResolvedValue({
        content: {
          type: "text",
          text: "1, 3",
        },
      }),
    };

    const mockServer = { server: mockSdkServer };

    const filtered = await filterResultsWithSampling({
      query: "test query",
      results: mockResults,
      maxResults: 10,
      server: mockServer as any,
    });

    expect(filtered).toHaveLength(2);
    expect(filtered[0].title).toBe("Result 1");
    expect(filtered[1].title).toBe("Result 3");

    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining("[LLM] Using IDE sampling"),
    );
  });

  it("should return raw results when no LLM and no client sampling support", async () => {
    // Sampling disabled (no IDE, no API)
    const { resetConfigForTesting: resetConfig } =
      await import("../../src/config/index.js");
    resetConfig(false);

    const { filterResultsWithSampling } =
      await import("../../src/server/helpers/filterResultsWithSampling.js");

    const consoleDebugSpy = vi.spyOn(console, "debug");

    const mockResults = [
      {
        urlHash: "hash1",
        url: "http://1.com",
        title: "Result 1",
        description: "Desc 1",
        engines: ["bing"],
        ranks: [1],
        consensusScore: 1.0,
      },
    ];

    // No sampling capability
    const mockSdkServer = {
      getClientCapabilities: vi.fn().mockReturnValue({}),
    };

    const mockServer = { server: mockSdkServer };

    const filtered = await filterResultsWithSampling({
      query: "test",
      results: mockResults,
      maxResults: 10,
      server: mockServer as any,
    });

    // Should return unfiltered (sampling not allowed)
    expect(filtered).toHaveLength(1);
    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining("Sampling not allowed"),
    );
  });

  it("should return empty array when LLM responds with 'none'", async () => {
    // Enable sampling with IDE support
    process.env.SAMPLING = "true";
    const { resetConfigForTesting: resetConfig } =
      await import("../../src/config/index.js");
    resetConfig(true);

    const { filterResultsWithSampling } =
      await import("../../src/server/helpers/filterResultsWithSampling.js");

    const mockResults = [
      {
        urlHash: "hash1",
        url: "http://1.com",
        title: "Spam Result",
        description: "Buy now!",
        engines: ["bing"],
        ranks: [1],
        consensusScore: 1.0,
      },
    ];

    const mockSdkServer = {
      getClientCapabilities: vi.fn().mockReturnValue({ sampling: {} }),
      createMessage: vi.fn().mockResolvedValue({
        content: {
          type: "text",
          text: "none",
        },
      }),
    };

    const mockServer = { server: mockSdkServer };

    const filtered = await filterResultsWithSampling({
      query: "test",
      results: mockResults,
      maxResults: 10,
      server: mockServer as any,
    });

    expect(filtered).toHaveLength(0);
  });
});

describe("updateSampling", () => {
  it("should import updateSampling without error", async () => {
    const module = await import("../../src/server/helpers/updateSampling.js");
    expect(module.updateSampling).toBeDefined();
  });
});

describe("Prompt Template", () => {
  it("should build sampling prompt correctly", async () => {
    const { buildSamplingPrompt } =
      await import("../../src/prompts/samplingPrompt.js");

    const prompt = buildSamplingPrompt(
      "test query",
      "1. Result A\n2. Result B",
    );

    expect(prompt).toContain('Query: "test query"');
    expect(prompt).toContain("1. Result A");
    expect(prompt).toContain("2. Result B");
    expect(prompt).toContain("comma-separated numbers");
  });
});

describe("Direct API Sampling (External LLM)", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Set up LLM config for direct API
    process.env.SAMPLING = "true";
    process.env.LLM_BASE_URL = "http://localhost:11434/v1";
    process.env.LLM_NAME = "llama3.2";
    process.env.SKIP_IDE_SAMPLING = "true"; // Force direct API usage
    delete process.env.LLM_API_KEY; // Local model, no key
    // Note: resetConfigForTesting must be called after dynamic import in each test
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("should use direct API when SKIP_IDE_SAMPLING=true", async () => {
    // Mock smartPost to simulate LLM API response
    const mockSmartPost = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            choices: [{ message: { content: "1, 2" } }],
          }),
        ),
    });

    vi.doMock("../../src/engines/fetch/client.js", () => ({
      smartPost: mockSmartPost,
      resetClients: vi.fn(),
    }));

    // Initialize config after module reset
    const { resetConfigForTesting: resetConfig } =
      await import("../../src/config/index.js");
    resetConfig();

    const { filterResultsWithSampling } =
      await import("../../src/server/helpers/filterResultsWithSampling.js");

    const consoleDebugSpy = vi.spyOn(console, "debug");

    const mockResults = [
      {
        urlHash: "hash1",
        url: "http://1.com",
        title: "Result 1",
        description: "Desc 1",
        engines: ["bing"],
        ranks: [1],
        consensusScore: 1.0,
      },
      {
        urlHash: "hash2",
        url: "http://2.com",
        title: "Result 2",
        description: "Desc 2",
        engines: ["brave"],
        ranks: [2],
        consensusScore: 0.5,
      },
    ];

    // Mock server that is NOT used (we expect direct API to be used)
    const mockSdkServer = {
      getClientCapabilities: vi.fn().mockReturnValue({ sampling: {} }),
      createMessage: vi.fn(),
    };
    const mockServer = { server: mockSdkServer };

    const filtered = await filterResultsWithSampling({
      query: "test",
      results: mockResults,
      maxResults: 10,
      server: mockServer as any,
    });

    // Verify smartPost was called (direct API)
    expect(mockSmartPost).toHaveBeenCalledTimes(1);
    expect(mockSmartPost).toHaveBeenCalledWith(
      "http://localhost:11434/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );

    // Verify MCP protocol was NOT used
    expect(mockSdkServer.createMessage).not.toHaveBeenCalled();

    // Verify filtering worked
    expect(filtered).toHaveLength(2);
    expect(filtered[0].title).toBe("Result 1");
    expect(filtered[1].title).toBe("Result 2");

    // Verify logs
    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining("Using direct API: llama3.2"),
    );
  });

  it("should include Authorization header when API key is set", async () => {
    process.env.LLM_API_KEY = "sk-test-key";

    const mockSmartPost = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            choices: [{ message: { content: "1" } }],
          }),
        ),
    });

    vi.doMock("../../src/engines/fetch/client.js", () => ({
      smartPost: mockSmartPost,
      resetClients: vi.fn(),
    }));

    // Initialize config after module reset
    const { resetConfigForTesting: resetConfig } =
      await import("../../src/config/index.js");
    resetConfig();

    const { filterResultsWithSampling } =
      await import("../../src/server/helpers/filterResultsWithSampling.js");

    const mockResults = [
      {
        urlHash: "hash1",
        url: "http://1.com",
        title: "Result 1",
        description: "Desc 1",
        engines: ["bing"],
        ranks: [1],
        consensusScore: 1.0,
      },
    ];

    const mockServer = {
      server: {
        getClientCapabilities: vi.fn().mockReturnValue({}),
      },
    };

    await filterResultsWithSampling({
      query: "test",
      results: mockResults,
      maxResults: 10,
      server: mockServer as any,
    });

    // Verify Authorization header was included
    expect(mockSmartPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test-key",
        }),
      }),
    );
  });

  it("should fallback to IDE when SKIP_IDE_SAMPLING=true but direct API fails and IDE is available", async () => {
    const mockSmartPost = vi.fn().mockRejectedValue(new Error("Network error"));

    vi.doMock("../../src/engines/fetch/client.js", () => ({
      smartPost: mockSmartPost,
      resetClients: vi.fn(),
    }));

    // Initialize config with IDE support for fallback
    const { resetConfigForTesting: resetConfig } =
      await import("../../src/config/index.js");
    resetConfig(true); // IDE supports sampling for fallback

    const { filterResultsWithSampling } =
      await import("../../src/server/helpers/filterResultsWithSampling.js");

    const consoleDebugSpy = vi.spyOn(console, "debug");

    const mockResults = [
      {
        urlHash: "hash1",
        url: "http://1.com",
        title: "Result 1",
        description: "Desc 1",
        engines: ["bing"],
        ranks: [1],
        consensusScore: 1.0,
      },
    ];

    const mockSdkServer = {
      getClientCapabilities: vi.fn().mockReturnValue({ sampling: {} }),
      createMessage: vi.fn().mockResolvedValue({
        content: { type: "text", text: "1" },
      }),
    };
    const mockServer = { server: mockSdkServer };

    const filtered = await filterResultsWithSampling({
      query: "test",
      results: mockResults,
      maxResults: 10,
      server: mockServer as any,
    });

    // Verify direct API was attempted and failed
    expect(mockSmartPost).toHaveBeenCalled();
    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining("[LLM] Primary strategy failed"),
    );

    // Verify graceful degradation to IDE
    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining("Falling back to IDE sampling"),
    );
    expect(mockSdkServer.createMessage).toHaveBeenCalled();
    expect(filtered).toHaveLength(1);
  });

  it("should prefer IDE sampling when SKIP_IDE_SAMPLING=false (default)", async () => {
    delete process.env.SKIP_IDE_SAMPLING; // Reset to default

    const mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    // Initialize config with IDE support
    const { resetConfigForTesting: resetConfig } =
      await import("../../src/config/index.js");
    resetConfig(true); // IDE supports sampling

    const { filterResultsWithSampling } =
      await import("../../src/server/helpers/filterResultsWithSampling.js");

    const consoleDebugSpy = vi.spyOn(console, "debug");

    const mockResults = [
      {
        urlHash: "hash1",
        url: "http://1.com",
        title: "Result 1",
        description: "Desc 1",
        engines: ["bing"],
        ranks: [1],
        consensusScore: 1.0,
      },
    ];

    const mockSdkServer = {
      getClientCapabilities: vi.fn().mockReturnValue({ sampling: {} }),
      createMessage: vi.fn().mockResolvedValue({
        content: { type: "text", text: "1" },
      }),
    };
    const mockServer = { server: mockSdkServer };

    const filtered = await filterResultsWithSampling({
      query: "test",
      results: mockResults,
      maxResults: 10,
      server: mockServer as any,
    });

    // Verify IDE was preferred, fetch NOT called
    expect(mockFetch).not.toHaveBeenCalled();
    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining("[LLM] Using IDE sampling"),
    );
    expect(mockSdkServer.createMessage).toHaveBeenCalled();
    expect(filtered).toHaveLength(1);
  });
});
