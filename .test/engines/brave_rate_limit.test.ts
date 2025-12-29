
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeMultiEngineSearch } from "../../src/server/helpers/executeMultiEngineSearch.js";
import { searchBrave, isBraveRateLimited, resetLastRequestTime } from "../../src/engines/brave/index.js";
import * as fetchModule from "../../src/engines/fetch/index.js";
import * as bingModule from "../../src/engines/bing/index.js";
import * as ddgModule from "../../src/engines/duckduckgo/index.js";

// Mock the dependencies of Brave engine (fetch)
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
// Mock other engines
vi.mock("../../src/engines/bing/index.js", () => ({
    searchBing: vi.fn().mockResolvedValue([{ title: "Bing Result", url: "bing.com", source: "bing", engine: "bing" }])
}));

vi.mock("../../src/engines/duckduckgo/index.js", () => ({
    searchDuckDuckGo: vi.fn().mockResolvedValue([{ title: "DDG Result", url: "ddg.com", source: "duckduckgo", engine: "duckduckgo" }])
}));

describe("Brave Rate Limiting Integration", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        resetLastRequestTime();
        vi.setSystemTime(new Date(2025, 1, 1, 12, 0, 0)); 
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should use Brave for the first request and handle pagination", async () => {
        const mockFetch = vi.mocked(fetchModule.fetchBravePage);
        const search = executeMultiEngineSearch("test1", ["brave"], 5);
        await vi.runAllTimersAsync();
        const results = await search;
        
        expect(results.some(r => r.engine === "brave")).toBe(true);
        // Expect 5 calls because our mock returns 1 result per page
        expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it("should skip Brave and fallback if requested immediately again", async () => {
        // First request sets the timer
        // We use a promise wrapper to allow advancing timers while search is running
        const search1 = executeMultiEngineSearch("test1", ["brave"], 10);
        await vi.runAllTimersAsync();
        await search1;
        
        // Advance time only by 1 second (less than 5s cooldown)
        vi.advanceTimersByTime(1000);

        // Second request
        const search2 = executeMultiEngineSearch("test2", ["brave"], 10);
        await vi.runAllTimersAsync();
        const results = await search2;

        // verify that fallback happened (Brave skipped, Bing/DDG used)
        const engines = new Set(results.map(r => r.engine));
        expect(engines.has("brave")).toBe(false);
        expect(engines.has("bing")).toBe(true);
        expect(engines.has("duckduckgo")).toBe(true);
    });

    it("should use Brave again after cooldown expires", async () => {
         // First request sets the timer
         const search1 = executeMultiEngineSearch("test1", ["brave"], 10);
         await vi.runAllTimersAsync();
         await search1;
         
         // Advance time by 6 seconds (more than 5s cooldown)
         vi.advanceTimersByTime(6000);
 
         // Second request
         const search2 = executeMultiEngineSearch("test3", ["brave"], 10);
         await vi.runAllTimersAsync();
         const results = await search2;
 
         expect(results.some(r => r.engine === "brave")).toBe(true);
    });
});
