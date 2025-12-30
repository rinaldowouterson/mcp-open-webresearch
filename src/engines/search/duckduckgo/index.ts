import type { SearchEngine } from "../../../types/search.js";
import { searchDuckDuckGo } from "./duckduckgo.js";
import { setThrottle, isThrottled } from "../throttle.js";

// DuckDuckGo has no rate limiting currently
setThrottle("duckduckgo", {
  searchCooldown: 0,
  pageCooldown: 0,
});

export const engine: SearchEngine = {
  name: "duckduckgo",
  search: searchDuckDuckGo,
  isRateLimited: () => isThrottled("duckduckgo"),
};
