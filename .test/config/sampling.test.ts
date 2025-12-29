import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getSampling } from "../../src/server/helpers/getSampling.js";

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

describe("Sampling Helpers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("getSampling", () => {
    it("should return true when SAMPLING env is not set", () => {
      delete process.env.SAMPLING;
      expect(getSampling()).toBe(true);
    });

    it("should return true when SAMPLING is empty string", () => {
      process.env.SAMPLING = "";
      expect(getSampling()).toBe(true);
    });

    it("should return true when SAMPLING is 'true'", () => {
      process.env.SAMPLING = "true";
      expect(getSampling()).toBe(true);
    });

    it("should return true when SAMPLING is 'TRUE' (case insensitive)", () => {
      process.env.SAMPLING = "TRUE";
      expect(getSampling()).toBe(true);
    });

    it("should return false when SAMPLING is 'false'", () => {
      process.env.SAMPLING = "false";
      expect(getSampling()).toBe(false);
    });

    it("should return false when SAMPLING is 'FALSE' (case insensitive)", () => {
      process.env.SAMPLING = "FALSE";
      expect(getSampling()).toBe(false);
    });

    it("should return false when SAMPLING is any non-true value", () => {
      process.env.SAMPLING = "disabled";
      expect(getSampling()).toBe(false);
    });
  });
});

describe("filterResultsWithSampling helpers", () => {
  describe("parseApprovedIndices (tested indirectly)", () => {
    // We test the parsing logic by examining what the filter returns
    // This is a smoke test for the module loading correctly
    it("should import filterResultsWithSampling without error", async () => {
      const module = await import(
        "../../src/server/helpers/filterResultsWithSampling.js"
      );
      expect(module.filterResultsWithSampling).toBeDefined();
      expect(module.clientSupportsSampling).toBeDefined();
    });
  });
});


describe("updateSampling", () => {
  it("should import updateSampling without error", async () => {
    const module = await import("../../src/server/helpers/updateSampling.js");
    expect(module.updateSampling).toBeDefined();
  });
});

describe("filterResultsWithSampling Integration", () => {
    it("should filter results based on LLM response and log debug messages", async () => {
      const { filterResultsWithSampling } = await import(
        "../../src/server/helpers/filterResultsWithSampling.js"
      );

      // Mock console.debug to verify logs
      const consoleDebugSpy = vi.spyOn(console, "debug");

      // Mock SearchResults
      const mockResults = [
        { title: "Result 1", url: "http://1.com", description: "Desc 1", source: "bing", engine: "bing" },
        { title: "Result 2", url: "http://2.com", description: "Desc 2", source: "bing", engine: "bing" },
        { title: "Result 3", url: "http://3.com", description: "Desc 3", source: "bing", engine: "bing" },
      ];

      // Mock McpServer structure
      const mockSdkServer = {
         getClientCapabilities: vi.fn().mockReturnValue({ sampling: {} }),
         createMessage: vi.fn().mockResolvedValue({
            content: {
               type: "text",
               text: "1, 3", // LLM approves result 1 and 3
            },
         }),
      };

      const mockServer = {
         server: mockSdkServer
      };

      const filtered = await filterResultsWithSampling({
        query: "test query",
        results: mockResults,
        maxResults: 10,
        server: mockServer as any,
      });

      // Verify filtering logic
      expect(filtered).toHaveLength(2);
      expect(filtered[0].title).toBe("Result 1");
      expect(filtered[1].title).toBe("Result 3");

      // Verify logs - this confirms the debug statements are executing
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Sampling] Strategy: Using MCP Protocol sampling...")
      );
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Sampling] Decision received: 1, 3")
      );
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Sampling] Filtered down to 2 results.")
      );
    });

    it("should robustly parse verbose LLM responses and stop at pattern break", async () => {
      const { filterResultsWithSampling } = await import(
        "../../src/server/helpers/filterResultsWithSampling.js"
      );

      const mockResults = [
        { title: "R1", url: "u1", description: "d1", source: "s", engine: "bing" },
        { title: "R2", url: "u2", description: "d2", source: "s", engine: "bing" },
        { title: "R3", url: "u3", description: "d3", source: "s", engine: "bing" },
        { title: "R4", url: "u4", description: "d4", source: "s", engine: "bing" },
        { title: "R5", url: "u5", description: "d5", source: "s", engine: "bing" },
      ];

      const mockSdkServer = {
         getClientCapabilities: vi.fn().mockReturnValue({ sampling: {} }),
         createMessage: vi.fn().mockResolvedValue({
            content: {
               type: "text",
               text: "I analyzed the results, and only 1, 2 and 5 were valid, but 3 and 4 was bad",
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

      // Should only include 1, 2, 5 (0, 1, 4 indices)
      // 3 and 4 should be ignored as they are part of a separate sentence/pattern
      expect(filtered).toHaveLength(3);
      expect(filtered.map(r => r.title)).toEqual(["R1", "R2", "R5"]);
    });
});
