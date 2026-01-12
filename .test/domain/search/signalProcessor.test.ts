import { describe, it, expect } from "vitest";
import { mergeSearchResults } from "../../../src/domain/search/signalProcessor.js";
import { SearchResult } from "../../../src/types/index.js";

describe("signalProcessor", () => {
  it("should select the majority title over the longest title", () => {
    const results: SearchResult[] = [
      {
        title: "Short Title",
        url: "https://example.com",
        description: "Desc 1",
        engine: "google",
      },
      {
        title: "Short Title",
        url: "https://example.com",
        description: "Desc 2",
        engine: "bing",
      },
      {
        title: "Very Long Descriptive Title That Should Lose",
        url: "https://example.com",
        description: "Desc 3",
        engine: "brave",
      },
    ];

    const merged = mergeSearchResults(results);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("Short Title");
  });

  it("should tie-break with length if votes are equal", () => {
    const results: SearchResult[] = [
      {
        title: "Short",
        url: "https://example.com",
        description: "Desc 1",
        engine: "google",
      },
      {
        title: "Longer Title",
        url: "https://example.com",
        description: "Desc 2",
        engine: "bing",
      },
    ];

    const merged = mergeSearchResults(results);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("Longer Title");
  });

  it("should deduplicate complex urls correctly", () => {
    const results: SearchResult[] = [
      {
        title: "Foo",
        url: "https://www.example.com/page",
        description: "Desc 1",
        engine: "google",
      },
      {
        title: "Foo",
        url: "http://example.com/page/",
        description: "Desc 2",
        engine: "bing",
      },
    ];

    const merged = mergeSearchResults(results);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("Foo");
  });
});
