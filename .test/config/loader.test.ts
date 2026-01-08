import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  loadConfig,
  resetLLMConfigForTesting,
} from "../../src/config/index.js";
import { ConfigOverrides } from "../../src/types/index.js";
import {
  configureLogger,
  captureConsoleDebug,
} from "../../src/utils/logger.js";

// Mock fs to prevent logger from writing files during tests
vi.mock("fs/promises", async () => {
  return {
    default: {
      access: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      open: vi.fn().mockResolvedValue({
        write: vi.fn(),
        close: vi.fn(),
      }),
      unlink: vi.fn(),
    },
  };
});

describe("Config Loader", () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    vi.resetModules();
    process.env = { ...originalEnv };

    // Reset logger configuration to defaults
    configureLogger({ writeToTerminal: false, writeToFile: false });

    // Initialize LLM config singleton for tests
    resetLLMConfigForTesting();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("should use default values when no env vars or overrides provided", () => {
    // Clear relevant env vars
    delete process.env.ENABLE_CORS;
    delete process.env.DEFAULT_SEARCH_ENGINES;
    delete process.env.ENABLE_PROXY;
    delete process.env.SOCKS5_PROXY;

    const config = loadConfig({});
    // Default engines are bing, duckduckgo, brave
    expect(config.defaultSearchEngines).toEqual([
      "bing",
      "duckduckgo",
      "brave",
    ]);
    // Default cors is false
    expect(config.enableCors).toBe(false);
    // Proxy not enabled
    expect(config.proxy.enabled).toBe(false);
  });

  describe("CLI Overrides vs Environment Variables", () => {
    it("should override proxy settings from CLI", () => {
      process.env.ENABLE_PROXY = "false";
      process.env.SOCKS5_PROXY = "socks5://old:9050";

      const overrides: ConfigOverrides = {
        proxyUrl: "socks5://user:pass@localhost:9050",
      };

      const config = loadConfig(overrides);
      expect(config.proxy.enabled).toBe(true);
      expect(config.proxy.url).toBe("socks5://user:pass@localhost:9050");
      expect(config.proxy.port).toBe(9050);
      expect(config.proxy.username).toBe("user");
      expect(config.proxy.password).toBe("pass");
    });

    it("should override engines from CLI", () => {
      process.env.DEFAULT_SEARCH_ENGINES = "bing";

      const overrides: ConfigOverrides = {
        engines: ["duckduckgo"],
      };

      const config = loadConfig(overrides);
      expect(config.defaultSearchEngines).toEqual(["duckduckgo"]);
    });

    it("should override debug flag from CLI", async () => {
      // Spy on the console.debug BEFORE wrapping it
      const spy = vi.spyOn(console, "debug").mockImplementation(() => {});

      process.env.WRITE_DEBUG_TERMINAL = "false";

      // Case 1: Debug enabled via CLI override
      const overrides: ConfigOverrides = {
        debug: true,
        proxyUrl: "invalid-url",
      };

      // Apply logger configuration (this would happen in src/index.ts)
      configureLogger({ writeToTerminal: overrides.debug });
      await captureConsoleDebug(); // Wraps console.debug with our spy inside as 'orig'

      // The loader will log an error. Since writeToTerminal is true,
      // the wrapper should call the original console.debug (our spy).
      loadConfig(overrides);

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining("loader: error detected: Invalid proxy URL"),
      );

      // Case 2: Debug disabled via CLI override
      spy.mockClear();

      // Re-configure logger to DISABLE terminal output
      configureLogger({ writeToTerminal: false });
      // Note: console is already wrapped, we just updated the config it reads.

      loadConfig({ ...overrides, debug: false });

      // The loader WILL execute console.debug(...)
      // BUT the Logger Wrapper should intercept it, see writeToTerminal is false,
      // and NOT call the original console.debug (our spy).
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("Boolean Flags", () => {
    it("should parse --cors correctly", () => {
      process.env.ENABLE_CORS = "false";
      const config = loadConfig({ cors: true });
      expect(config.enableCors).toBe(true);
    });

    it("should default --cors to false if not provided and env is false", () => {
      process.env.ENABLE_CORS = "false";
      const config = loadConfig({});
      expect(config.enableCors).toBe(false);
    });
  });

  describe("Proxy URL Parsing", () => {
    it("should parse valid socks5 url", () => {
      const overrides: ConfigOverrides = {
        proxyUrl: "socks5://user:pass@localhost:9050",
      };
      const config = loadConfig(overrides);
      expect(config.proxy.isValid).toBe(true);
      expect(config.proxy.protocol).toBe("socks5");
      expect(config.proxy.host).toBe("localhost");
      expect(config.proxy.port).toBe(9050);
      expect(config.proxy.username).toBe("user");
      expect(config.proxy.password).toBe("pass");
    });

    it("should handle invalid proxy url gracefully", () => {
      const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const overrides: ConfigOverrides = {
        proxyUrl: "notaproxy://localhost",
        debug: true, // enable debug to see if it catches error
      };
      const config = loadConfig(overrides);
      expect(config.proxy.isValid).toBe(false);
      expect(config.proxy.error).toBeDefined();
      expect(spy).toHaveBeenCalled(); // Should log error
    });
  });

  describe("LLM Config Loading", () => {
    beforeEach(() => {
      delete process.env.SAMPLING;
      delete process.env.LLM_BASE_URL;
      delete process.env.LLM_API_KEY;
      delete process.env.LLM_NAME;
      delete process.env.LLM_TIMEOUT_MS;
    });

    it("should load LLM config from environment variables", () => {
      process.env.LLM_BASE_URL = "https://api.example.com/v1";
      process.env.LLM_API_KEY = "test-key";
      process.env.LLM_NAME = "test-model";
      process.env.SAMPLING = "true";
      process.env.LLM_TIMEOUT_MS = "5000";

      resetLLMConfigForTesting(); // Re-init with new env vars
      const config = loadConfig();

      expect(config.llm.baseUrl).toBe("https://api.example.com/v1");
      expect(config.llm.apiKey).toBe("test-key");
      expect(config.llm.model).toBe("test-model");
      expect(config.llm.samplingAllowed).toBe(true);
      expect(config.llm.timeoutMs).toBe(5000);
      expect(config.llm.apiSamplingAvailable).toBe(true);
    });

    it("should compute apiSamplingAvailable correctly for local LLM (no apiKey)", () => {
      process.env.LLM_BASE_URL = "http://localhost:11434/v1";
      process.env.LLM_NAME = "llama3.2";
      // No API key - local model

      resetLLMConfigForTesting();
      const config = loadConfig();

      expect(config.llm.apiSamplingAvailable).toBe(true);
      expect(config.llm.apiKey).toBeNull();
    });

    it("should compute apiSamplingAvailable = false when model is missing", () => {
      process.env.LLM_BASE_URL = "http://localhost:11434/v1";
      process.env.LLM_API_KEY = "test-key";
      // No model

      resetLLMConfigForTesting();
      const config = loadConfig();

      expect(config.llm.apiSamplingAvailable).toBe(false);
    });

    it("should log warning when SAMPLING=true but LLM not available", () => {
      const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
      process.env.SAMPLING = "true";
      // No LLM config

      resetLLMConfigForTesting();
      loadConfig();

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Sampling is enabled but IDE does not support sampling",
        ),
      );
    });

    it("should default timeoutMs to 30000 when not set", () => {
      const config = loadConfig();
      expect(config.llm.timeoutMs).toBe(30000);
    });
  });
});
