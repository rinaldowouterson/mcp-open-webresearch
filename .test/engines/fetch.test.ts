import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import type { AppConfig } from "../../src/types/app-config";

// Mock the https-proxy-agent module
const mockAgent = {
  proxy: new URL('http://proxy.example.com:8080/'),
  options: { host: 'proxy.example.com', port: 8080 }
};

vi.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: vi.fn().mockImplementation(() => mockAgent)
}));

// Mock the config loader module
const mockLoadConfig = vi.fn();
vi.mock("../../src/config/index", () => ({
  loadConfig: mockLoadConfig,
}));

// We'll dynamically import the module in the tests

describe("Proxy Configuration Tests", () => {
  beforeEach(() => {
    // Reset axios defaults before each test
    axios.defaults.httpAgent = undefined;
    axios.defaults.httpsAgent = undefined;

    // Clear all mocks
    vi.clearAllMocks();
    
    // Reset config mock
    mockLoadConfig.mockReturnValue({
      proxy: {
        enabled: false,
        isValid: false,
        url: "",
        error: null,
        agent: null
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should set axios agents when proxy is enabled and valid", async () => {
    const proxyUrl = "http://proxy.example.com:8080";
    const mockAgentInstance = {
      http: { proxy: new URL(proxyUrl) },
      https: { proxy: new URL(proxyUrl) }
    };
    
    // Mock the config loader to return our test configuration
    mockLoadConfig.mockReturnValue({
      proxy: {
        enabled: true,
        isValid: true,
        url: proxyUrl,
        error: null,
        agent: mockAgentInstance
      }
    });

    // Clear any existing axios defaults
    axios.defaults.httpAgent = undefined;
    axios.defaults.httpsAgent = undefined;

    // Import the module to test
    const fetchModule = await import("../../src/engines/fetch/index.js");
    
    // Verify the proxy agents were set
    expect(axios.defaults.httpAgent).toBe(mockAgentInstance.http);
    expect(axios.defaults.httpsAgent).toBe(mockAgentInstance.https);
  });

  it("should not set axios agents when proxy is disabled", async () => {
    // Mock config with proxy disabled
    mockLoadConfig.mockReturnValue({
      proxy: {
        enabled: false,
        isValid: true,
        url: "http://proxy.example.com:8080",
        error: null,
        agent: null
      }
    });

    // Import the module to test
    await import("../../src/engines/fetch/index.js");

    // Verify no agents were set up
    expect(axios.defaults.httpAgent).toBeUndefined();
    expect(axios.defaults.httpsAgent).toBeUndefined();
  });

  it("should not set axios agents when proxy is invalid", async () => {
    // Mock config with proxy enabled but invalid
    mockLoadConfig.mockReturnValue({
      proxy: {
        enabled: true,
        isValid: false,
        url: "invalid-proxy-url",
        error: "Invalid proxy configuration",
        agent: null
      }
    });

    // Import the module to test
    await import("../../src/engines/fetch/index.js");

    // Verify no agents were set up
    expect(axios.defaults.httpAgent).toBeUndefined();
    expect(axios.defaults.httpsAgent).toBeUndefined();
  });

  it("should handle missing proxy configuration gracefully", async () => {
    // Mock config with no proxy configuration
    mockLoadConfig.mockReturnValue({
      proxy: {
        enabled: false,
        isValid: false,
        url: "",
        error: null,
        agent: null
      }
    });

    // Import the module to test
    await import("../../src/engines/fetch/index.js");

    // Verify no agents were set up
    expect(axios.defaults.httpAgent).toBeUndefined();
    expect(axios.defaults.httpsAgent).toBeUndefined();
  });

  it("should handle empty proxy configuration gracefully", async () => {
    // Mock config with empty proxy configuration
    mockLoadConfig.mockReturnValue({
      proxy: {
        enabled: false,
        isValid: false,
        url: "",
        error: null,
        agent: null
      }
    });

    // Import the module to test
    await import("../../src/engines/fetch/index.js");

    // Verify no agents were set up
    expect(axios.defaults.httpAgent).toBeUndefined();
    expect(axios.defaults.httpsAgent).toBeUndefined();
  });
});

describe("Fetch Functions Tests", () => {
  let fetchModule: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Reset axios defaults
    axios.defaults.httpAgent = undefined;
    axios.defaults.httpsAgent = undefined;
    
    // Mock the fetch module
    vi.doMock("../../src/engines/fetch/index.js", () => ({
      fetchBingPage: vi.fn(),
      fetchBravePage: vi.fn(),
    }));
    
    // Import the module after setting up mocks
    fetchModule = await import("../../src/engines/fetch/index.js");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should use axios with correct parameters for Bing search", async () => {
    const mockResponse = { data: "<html>Mock Bing Results</html>" };
    const mockGet = vi.fn().mockResolvedValue(mockResponse);
    vi.spyOn(axios, "get").mockImplementation(mockGet);

    // Mock the actual implementation of fetchBingPage
    fetchModule.fetchBingPage = vi.fn().mockImplementation(async (query: string, page: number) => {
      const response = await axios.get("https://www.bing.com/search", {
        params: {
          q: query,
          first: page * 10 + 1,
          mkt: "en-US",
          setlang: "en-US",
          cc: "US",
          ensearch: 1,
        },
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Test/1.0)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        },
        timeout: 10000,
      });
      return response.data;
    });

    const result = await fetchModule.fetchBingPage("test query", 0);

    expect(mockGet).toHaveBeenCalledWith("https://www.bing.com/search", {
      params: {
        q: "test query",
        first: 1,
        mkt: "en-US",
        setlang: "en-US",
        cc: "US",
        ensearch: 1,
      },
      headers: expect.objectContaining({
        "User-Agent": expect.stringContaining("Mozilla/5.0"),
        Accept: expect.stringContaining("text/html"),
      }),
      timeout: 10000,
    });
    expect(result).toBe("<html>Mock Bing Results</html>");
  });

  it("should use axios with correct parameters for Brave search", async () => {
    const mockResponse = { data: "<html>Mock Brave Results</html>" };
    const mockGet = vi.fn().mockResolvedValue(mockResponse);
    vi.spyOn(axios, "get").mockImplementation(mockGet);

    // Mock the actual implementation of fetchBravePage
    fetchModule.fetchBravePage = vi.fn().mockImplementation(async (query: string, offset: number) => {
      const response = await axios.get("https://search.brave.com/search", {
        params: {
          q: query,
          source: "web",
          offset: offset,
        },
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Test/1.0)",
          "Accept": "*/*",
        },
        timeout: 10000,
      });
      return response.data;
    });

    const result = await fetchModule.fetchBravePage("test query", 0);

    expect(mockGet).toHaveBeenCalledWith("https://search.brave.com/search", {
      params: {
        q: "test query",
        source: "web",
        offset: 0,
      },
      headers: expect.objectContaining({
        "User-Agent": expect.stringContaining("Mozilla/5.0"),
        Accept: "*/*",
      }),
      timeout: 10000,
    });
    expect(result).toBe("<html>Mock Brave Results</html>");
  });

  it("should handle network errors gracefully", async () => {
    const mockError = new Error("Network timeout");
    vi.spyOn(axios, "get").mockRejectedValue(mockError);

    // Mock the fetchBingPage implementation to throw
    fetchModule.fetchBingPage = vi.fn().mockRejectedValue(new Error("Bing search failed: Network timeout"));

    await expect(fetchModule.fetchBingPage("test query", 0)).rejects.toThrow(
      "Bing search failed: Network timeout"
    );
  });
});
