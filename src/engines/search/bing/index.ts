import type { SearchEngine } from "../../../types/search.js";
import { searchBing } from "./bing.js";

export const engine: SearchEngine = {
  name: "bing",
  search: searchBing,
  isRateLimited: () => false,
};
