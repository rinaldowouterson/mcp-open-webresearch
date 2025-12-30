
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchBrave } from "../../src/engines/search/brave/brave.js";
import * as fetchModule from "../../src/engines/fetch/index.js";

// Mock the dependencies
vi.mock("../../src/engines/fetch/index.js", () => ({
    fetchBravePage: vi.fn(),
}));

describe("Brave Pagination Delay", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should add delay between pages if requests are fast", async () => {
        const mockFetch = vi.mocked(fetchModule.fetchBravePage);
        const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
        
        // Mock results for multiple pages
        mockFetch.mockResolvedValueOnce(`<html><body><div id="results"><div class="snippet"><div class="title">Result 1</div><a class="heading-serpresult" href="http://example.com/1">Link</a></div></div></body></html>`)
                 .mockResolvedValueOnce(`<html><body><div id="results"><div class="snippet"><div class="title">Result 2</div><a class="heading-serpresult" href="http://example.com/2">Link</a></div></div></body></html>`)
                 .mockResolvedValue(`<html><body><div id="results"></div></body></html>`);

        // Request 20 results
        const searchPromise = searchBrave("test", 20);

        // Step 1: Initial call - immediate
        await vi.advanceTimersByTimeAsync(10); 
        expect(mockFetch).toHaveBeenCalledTimes(1);

        // Step 2: Loop logic check
        // First request "took" ~10ms (virtual). Elapsed < 1000.
        // Expect delay ~990ms.
        
        // Verify we are waiting
        await vi.advanceTimersByTimeAsync(500);
        expect(mockFetch).toHaveBeenCalledTimes(1);
        
        // Verify setTimeout WAS called with something close to 1000ms
        // Note: exact math might vary slightly due to execution time, but should be > 0.
        expect(setTimeoutSpy).toHaveBeenCalled();
        const delayArg = setTimeoutSpy.mock.calls[0][1] as number;
        expect(delayArg).toBeGreaterThan(900); // Allow small margin
        expect(delayArg).toBeLessThanOrEqual(1000);

        // Advance enabling next call
        await vi.advanceTimersByTimeAsync(600);
        expect(mockFetch).toHaveBeenCalledTimes(2);

        // Let it finish
        await vi.advanceTimersByTimeAsync(2000); 
        await searchPromise;
    });

    it("should NOT add delay if previous request took long enough", async () => {
        const mockFetch = vi.mocked(fetchModule.fetchBravePage);
        const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
        
        // Mock first request taking 1.2s
        mockFetch.mockImplementationOnce(async () => {
            vi.advanceTimersByTime(1200); // Simulate time passing during request
            return `<html><body><div id="results"><div class="snippet"><div class="title">Result 1</div><a class="heading-serpresult" href="http://example.com/1">Link</a></div></div></body></html>`;
        })
        .mockResolvedValue(`<html><body><div id="results"></div></body></html>`);

        const searchPromise = searchBrave("test", 20);
        
        // Advance time to allow the mock to "finish"
        // Wait for the total duration (1200ms) + small buffer
        await vi.advanceTimersByTimeAsync(1300);
        
        // Ensure promise completes
        await searchPromise;
        
        // Verify setTimeout was NOT called
        expect(setTimeoutSpy).not.toHaveBeenCalled();
    });
});
