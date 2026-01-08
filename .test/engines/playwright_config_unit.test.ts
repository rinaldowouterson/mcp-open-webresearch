/**
 * Playwright Configuration Unit Tests
 * Tests launch options, proxy configuration, and argument generation.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { createLaunchOptionsForPlayWright } from "../../src/engines/visit_page/visit.js";
import { getConfig } from "../../src/config/index.js";

// Mock the config loader
vi.mock("../../src/config/index.js", () => ({
  getConfig: vi.fn(),
}));

describe("createLaunchOptionsForPlayWright", () => {
  const mockLoadConfig = vi.mocked(getConfig);
  const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  afterAll(() => {
    consoleDebugSpy.mockRestore();
  });

  // Helper function to create a complete AppConfig with proxy settings
  const createMockConfig = (proxyConfig: any) => {
    const defaultSearchEngines: ("bing" | "duckduckgo" | "brave")[] = ["bing", "duckduckgo", "brave"];
    
    return {
      defaultSearchEngines,
      enableCors: true,
      corsOrigin: "*",
      proxy: {
        enabled: false,
        isValid: false,
        url: "",
        error: null,
        agent: undefined,
        protocol: null,
        host: null,
        port: null,
        ...proxyConfig,
      },
      ssl: {
        ignoreTlsErrors: false,
      },
    };
  };

  beforeEach(() => {
    // Reset all mocks before each test
    vi.resetAllMocks();
    
    // Default config with proxy disabled
    mockLoadConfig.mockReturnValue(createMockConfig({}));
    
    // Clear mock calls but keep the implementation
    consoleDebugSpy.mockClear();
  });

  it("returns default launch options when proxy is disabled", () => {
    const result = createLaunchOptionsForPlayWright();
    
    expect(result).toEqual(expect.objectContaining({
      headless: true,
    }));
    
    // Verify the debug logs were called with expected messages
    const debugCalls = consoleDebugSpy.mock.calls.map(call => call[0]);
    
    // Check if the debug calls contain the expected messages
    expect(debugCalls).toContain("visit: config.proxy.enabled: false");
    expect(debugCalls.some(call => 
      typeof call === 'string' && call.includes('visit: config.proxy.enabled:')
    )).toBe(true);
  });

  it("returns default launch options when proxy is enabled but not valid", () => {
    mockLoadConfig.mockReturnValue(createMockConfig({
      enabled: true,
      isValid: false,
      url: "http://invalid-proxy",
      error: "Invalid URL",
      protocol: null,
      host: null,
      port: null,
    }));

    const result = createLaunchOptionsForPlayWright();
    
    expect(result).toEqual(expect.objectContaining({
      headless: true,
    }));
  });

  it("configures HTTP proxy without authentication", () => {
    mockLoadConfig.mockReturnValue(createMockConfig({
      enabled: true,
      isValid: true,
      url: "http://proxy.example.com:8080",
      error: null,
      protocol: "http",
      host: "proxy.example.com",
      port: 8080,
      username: null,
      password: null,
    }));

    const result = createLaunchOptionsForPlayWright();
    
    expect(result).toEqual(expect.objectContaining({
      headless: true,
      proxy: {
        server: "http://proxy.example.com:8080",
        username: undefined,
        password: undefined,
      },
    }));
    
    // Check if the proxy debug message was logged
    const proxyDebugCall = consoleDebugSpy.mock.calls.some(call => 
      call[0] === "Using proxy: http://proxy.example.com:8080" ||
      call[0]?.includes("http://proxy.example.com:8080")
    );
    expect(proxyDebugCall).toBe(true);
  });

  it("configures HTTPS proxy with authentication", () => {
    mockLoadConfig.mockReturnValue(createMockConfig({
      enabled: true,
      isValid: true,
      url: "https://user:pass@proxy.example.com:8080",
      error: null,
      protocol: "https",
      host: "proxy.example.com",
      port: 8080,
      username: "user",
      password: "pass",
    }));

    const result = createLaunchOptionsForPlayWright();
    
    expect(result).toEqual(expect.objectContaining({
      headless: true,
      proxy: {
        server: "https://proxy.example.com:8080",
        username: "user",
        password: "pass",
      },
    }));
    
    // Check if the proxy debug message was logged
    const proxyDebugCall = consoleDebugSpy.mock.calls.some(call => 
      call[0] === "Using proxy: https://proxy.example.com:8080" ||
      call[0]?.includes("https://proxy.example.com:8080")
    );
    expect(proxyDebugCall).toBe(true);
  });

  it("configures SOCKS5 proxy with authentication", () => {
    mockLoadConfig.mockReturnValue(createMockConfig({
      enabled: true,
      isValid: true,
      url: "socks5://user:pass@proxy.example.com:1080",
      error: null,
      protocol: "socks5",
      host: "proxy.example.com",
      port: 1080,
      username: "user",
      password: "pass",
    }));

    const result = createLaunchOptionsForPlayWright();
    
    expect(result).toEqual(expect.objectContaining({
      headless: true,
      proxy: {
        server: "socks5://proxy.example.com:1080",
        username: "user",
        password: "pass",
      },
    }));
    
    // Check if the proxy debug message was logged
    const proxyDebugCall = consoleDebugSpy.mock.calls.some(call => 
      call[0] === "Using proxy: socks5://proxy.example.com:1080" ||
      call[0]?.includes("socks5://proxy.example.com:1080")
    );
    expect(proxyDebugCall).toBe(true);
  });

  it("handles missing host or port in proxy URL", () => {
    // Missing port
    mockLoadConfig.mockReturnValue(createMockConfig({
      enabled: true,
      isValid: true,
      url: "http://proxy.example.com",
      error: null,
      protocol: "http",
      host: "proxy.example.com",
      port: null,
    }));

    const result = createLaunchOptionsForPlayWright();
    
    expect(result).toEqual(expect.objectContaining({
      headless: true,
    }));
    
    // Check if the proxy debug message was logged
    let proxyDebugCall = consoleDebugSpy.mock.calls.some(call => 
      call[0] === "Proxy configuration incomplete - host or port missing" ||
      call[0]?.includes("host or port missing")
    );
    expect(proxyDebugCall).toBe(true);

    // Clear mock calls before next test case
    consoleDebugSpy.mockClear();

    // Missing host
    mockLoadConfig.mockReturnValue(createMockConfig({
      enabled: true,
      isValid: true,
      url: "http://:8080",
      error: null,
      protocol: "http",
      host: null,
      port: 8080,
    }));

    const result2 = createLaunchOptionsForPlayWright();
    
    expect(result2).toEqual(expect.objectContaining({
      headless: true,
    }));
    
    // Check if the proxy debug message was logged
    proxyDebugCall = consoleDebugSpy.mock.calls.some(call => 
      call[0] === "Proxy configuration incomplete - host or port missing" ||
      call[0]?.includes("host or port missing")
    );
    expect(proxyDebugCall).toBe(true);
  });

  it("handles invalid proxy protocol", () => {
    mockLoadConfig.mockReturnValue(createMockConfig({
      enabled: true,
      isValid: true,
      url: "ftp://proxy.example.com:8080",
      error: null,
      protocol: "ftp" as any, // Force invalid protocol for test
      host: "proxy.example.com",
      port: 8080,
    }));

    const result = createLaunchOptionsForPlayWright();
    
    // Should still work but log a warning
    expect(result).toEqual(expect.objectContaining({
      headless: true,
      proxy: {
        server: "ftp://proxy.example.com:8080",
        username: undefined,
        password: undefined,
      },
    }));
    
    // Check if the proxy debug message was logged
    const proxyDebugCall = consoleDebugSpy.mock.calls.some(call => 
      call[0] === "Using proxy: ftp://proxy.example.com:8080" ||
      call[0]?.includes("ftp://proxy.example.com:8080")
    );
    expect(proxyDebugCall).toBe(true);
  });

  it("handles empty proxy configuration", () => {
    mockLoadConfig.mockReturnValue(createMockConfig({
      enabled: true,
      isValid: false,
      url: "",
      error: "No proxy URL provided",
      protocol: null,
      host: null,
      port: null,
    }));

    const result = createLaunchOptionsForPlayWright();
    
    expect(result).toEqual(expect.objectContaining({
      headless: true,
    }));
  });
});
