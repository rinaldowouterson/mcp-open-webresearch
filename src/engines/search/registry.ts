import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SearchEngine } from "../../types/search.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cache: Map<string, SearchEngine> | null = null;

/**
 * Discovers and loads all search engines from subdirectories.
 * Each subdirectory must have an index.ts exporting `engine: SearchEngine`.
 */
export async function getEngines(): Promise<Map<string, SearchEngine>> {
  if (cache) return cache;

  cache = new Map();
  const entries = fs.readdirSync(__dirname, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    try {
      const modulePath = `./${entry.name}/index.js`;
      const module = await import(modulePath);

      if (module.engine && typeof module.engine.search === "function") {
        cache.set(module.engine.name, module.engine);
        console.debug(`Engine loaded: ${module.engine.name}`);
      }
    } catch {
      // Skip folders that don't have a valid engine export
      console.debug(`Skipped folder: ${entry.name} (not a valid engine)`);
    }
  }

  return cache;
}

/**
 * Returns list of all discovered engine names.
 */
export async function getEngineNames(): Promise<string[]> {
  const engines = await getEngines();
  return Array.from(engines.keys());
}

/**
 * Clears the engine cache (useful for testing).
 */
export function clearEngineCache(): void {
  cache = null;
}
