import type { SearchEngine } from "../../../types/search.js";
import { searchBing } from "./bing.js";
import { setThrottle, isThrottled } from "../throttle.js";

// Bing has no rate limiting, but configure with zeros for consistency
setThrottle("bing", {
  searchCooldown: 0,
  pageCooldown: 0,
});

export const engine: SearchEngine = {
  name: "bing",
  search: searchBing,
  isRateLimited: () => isThrottled("bing"),
};
