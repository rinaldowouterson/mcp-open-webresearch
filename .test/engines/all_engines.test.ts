/**
 * Dynamic engine test suite.
 * Automatically discovers all engines and verifies they satisfy the SearchEngine contract.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getEngines } from "../../src/engines/search/registry.js";
import type { SearchEngine } from "../../src/types/search.js";

describe("All Search Engines", () => {
  let engines: Map<string, SearchEngine>;

  beforeAll(async () => {
    engines = await getEngines();
  });

  it("discovers at least one engine", () => {
    expect(engines.size).toBeGreaterThan(0);
    console.log(`Discovered ${engines.size} engines: ${[...engines.keys()].join(", ")}`);
  });

  it("each engine has required properties", () => {
    for (const [name, engine] of engines) {
      // Name matches key
      expect(engine.name).toBe(name);
      
      // search is a function
      expect(typeof engine.search).toBe("function");
      
      // isRateLimited is a function
      expect(typeof engine.isRateLimited).toBe("function");
    }
  });

  it("isRateLimited() returns boolean", () => {
    for (const [name, engine] of engines) {
      const result = engine.isRateLimited();
      expect(typeof result).toBe("boolean");
    }
  });
});
