import type { SearchEngine } from "../../../types/search.js";
import { searchBrave, isBraveRateLimited } from "./brave.js";

export const engine: SearchEngine = {
  name: "brave",
  search: searchBrave,
  isRateLimited: isBraveRateLimited,
};
