/**
 * Fetch Client Unit Tests
 * Tests configuration logic, proxy setup, and browser mode selection.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock config loader
const mockLoadConfig = vi.fn();
vi.mock("../../src/config/index", () => ({
  getConfig: mockLoadConfig,
}));

// Mock Impit
const mockImpitConstructor = vi.fn();
const mockFetch = vi.fn();
vi.mock("impit", () => ({
  Impit: class {
    constructor(options: any) {
      mockImpitConstructor(options);
    }
    fetch = mockFetch;
  },
}));

describe("Fetch Layer", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe("Client Configuration", () => {
    it("should initialize Impit with proxy when enabled", async () => {
      mockLoadConfig.mockReturnValue({
        proxy: { enabled: true, url: "http://proxy:8080" },
        ssl: { ignoreTlsErrors: false },
      });
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(""),
      });

      const { smartFetch } = await import("../../src/engines/fetch/client.js");
      // Trigger lazy initialization by calling smartFetch
      await smartFetch("http://example.com", { browserMode: true });

      const calls = mockImpitConstructor.mock.calls;
      // Expect at least one client to be initialized with proxy
      const hasProxy = calls.some(
        (args: any[]) => args[0].proxyUrl === "http://proxy:8080",
      );
      expect(hasProxy).toBe(true);
    });

    it("should initialize Impit without proxy when disabled", async () => {
      mockLoadConfig.mockReturnValue({
        proxy: { enabled: false, url: "http://proxy:8080" },
        ssl: { ignoreTlsErrors: false },
      });
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(""),
      });

      const { smartFetch } = await import("../../src/engines/fetch/client.js");
      // Trigger lazy initialization by calling smartFetch
      await smartFetch("http://example.com", { browserMode: true });

      const calls = mockImpitConstructor.mock.calls;
      const hasProxy = calls.some(
        (args: any[]) => args[0]?.proxyUrl !== undefined,
      );
      expect(hasProxy).toBe(false);
    });
  });

  describe("Engine Usage", () => {
    it("fetchBingPage should use browserMode: true", async () => {
      // Mock smartFetch for this test specifically
      const mockSmartFetch = vi.fn().mockResolvedValue("<html>bing</html>");
      vi.doMock("../../src/engines/fetch/client.js", () => ({
        smartFetch: mockSmartFetch,
        resetClients: vi.fn(),
      }));
      // Also need to re-mock config because import chain might reload it
      mockLoadConfig.mockReturnValue({ proxy: { enabled: false }, ssl: {} });

      const { fetchBingPage } =
        await import("../../src/engines/fetch/index.js");
      await fetchBingPage("query", 0);

      expect(mockSmartFetch).toHaveBeenCalledWith(
        expect.stringContaining("bing.com"),
        expect.objectContaining({ browserMode: true }),
      );
    });

    it("fetchDuckDuckSearchPage should use browserMode: false", async () => {
      const mockSmartFetch = vi.fn().mockResolvedValue("<html>ddg</html>");
      vi.doMock("../../src/engines/fetch/client.js", () => ({
        smartFetch: mockSmartFetch,
        resetClients: vi.fn(),
      }));
      mockLoadConfig.mockReturnValue({ proxy: { enabled: false }, ssl: {} });

      const { fetchDuckDuckSearchPage } =
        await import("../../src/engines/fetch/index.js");
      await fetchDuckDuckSearchPage("query");

      expect(mockSmartFetch).toHaveBeenCalledWith(
        expect.stringContaining("duckduckgo.com"),
        expect.objectContaining({ browserMode: false }),
      );
    });

    it("fetchBravePage should use browserMode: true", async () => {
      const mockSmartFetch = vi.fn().mockResolvedValue("<html>brave</html>");
      vi.doMock("../../src/engines/fetch/client.js", () => ({
        smartFetch: mockSmartFetch,
        resetClients: vi.fn(),
      }));
      mockLoadConfig.mockReturnValue({ proxy: { enabled: false }, ssl: {} });

      const { fetchBravePage } =
        await import("../../src/engines/fetch/index.js");
      await fetchBravePage("query", 0);

      expect(mockSmartFetch).toHaveBeenCalledWith(
        expect.stringContaining("brave.com"),
        expect.objectContaining({ browserMode: true }),
      );
    });
  });
});
