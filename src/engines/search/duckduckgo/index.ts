import type { SearchEngine } from "../../../types/search.js";
import { searchDuckDuckGo } from "./duckduckgo.js";

export const engine: SearchEngine = {
  name: "duckduckgo",
  search: searchDuckDuckGo,
  isRateLimited: () => false,
};
