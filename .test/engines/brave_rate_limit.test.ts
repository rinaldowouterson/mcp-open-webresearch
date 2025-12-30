
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeMultiEngineSearch } from "../../src/server/helpers/executeMultiEngineSearch.js";
import { resetLastRequestTime, isBraveRateLimited } from "../../src/engines/search/brave/brave.js";
import * as fetchModule from "../../src/engines/fetch/index.js";
import * as registry from "../../src/engines/search/registry.js";

// Mock the fetch module
vi.mock("../../src/engines/fetch/index.js", () => ({
    fetchBravePage: vi.fn().mockResolvedValue(`
        <html>
            <body>
                <div id="results">
                    <div class="snippet">
                        <div class="title">Brave Result</div>
                        <a class="heading-serpresult" href="http://brave.com">Link</a>
                        <div class="snippet-description">Description</div>
                        <div class="sitename">Brave</div>
                    </div>
                </div>
            </body>
        </html>
    `)
}));

// Mock the registry to return controlled engines
vi.mock("../../src/engines/search/registry.js", () => {
    // Create mock engines with controllable rate limiting
    let braveRateLimited = false;
    
    const mockEngines = new Map([
        ["brave", {
            name: "brave",
            search: vi.fn().mockImplementation(async () => [
                { title: "Brave Result", url: "http://brave.com", description: "Desc", source: "brave", engine: "brave" }
            ]),
            isRateLimited: () => braveRateLimited,
        }],
        ["bing", {
            name: "bing",
            search: vi.fn().mockResolvedValue([
                { title: "Bing Result", url: "http://bing.com", description: "Desc", source: "bing", engine: "bing" }
            ]),
            isRateLimited: () => false,
        }],
        ["duckduckgo", {
            name: "duckduckgo",
            search: vi.fn().mockResolvedValue([
                { title: "DDG Result", url: "http://ddg.com", description: "Desc", source: "duckduckgo", engine: "duckduckgo" }
            ]),
            isRateLimited: () => false,
        }],
    ]);

    return {
        getEngines: vi.fn().mockResolvedValue(mockEngines),
        getEngineNames: vi.fn().mockResolvedValue(["brave", "bing", "duckduckgo"]),
        clearEngineCache: vi.fn(),
        // Expose a way to control rate limiting for tests
        _setMockRateLimited: (engine: string, limited: boolean) => {
            const e = mockEngines.get(engine);
            if (e) {
                (e as any).isRateLimited = () => limited;
            }
        },
        _getMockEngines: () => mockEngines,
    };
});

describe("Brave Rate Limiting Integration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset rate limiting state
        (registry as any)._setMockRateLimited("brave", false);
    });

    it("should use Brave when not rate limited", async () => {
        const results = await executeMultiEngineSearch("test1", ["brave"], 5);
        
        expect(results.some(r => r.engine === "brave")).toBe(true);
    });

    it("should skip Brave and fallback when rate limited", async () => {
        // Mark brave as rate limited
        (registry as any)._setMockRateLimited("brave", true);

        const results = await executeMultiEngineSearch("test2", ["brave"], 5);

        // Brave should be skipped, fallback to first available engine
        expect(results.some(r => r.engine === "brave")).toBe(false);
        // Should have results from fallback engine
        expect(results.length).toBeGreaterThan(0);
    });

    it("should use Brave again after rate limit clears", async () => {
        // First: rate limited
        (registry as any)._setMockRateLimited("brave", true);
        const results1 = await executeMultiEngineSearch("test3", ["brave"], 5);
        expect(results1.some(r => r.engine === "brave")).toBe(false);

        // Second: not rate limited anymore
        (registry as any)._setMockRateLimited("brave", false);
        const results2 = await executeMultiEngineSearch("test4", ["brave"], 5);
        expect(results2.some(r => r.engine === "brave")).toBe(true);
    });
});
