import type { SearchEngine } from "../../../types/search.js";
import { searchBing } from "./bing.js";
import { setThrottle, isThrottled } from "../throttle.js";

// Configure Bing's throttle settings (same as Brave)
setThrottle("bing", {
  searchCooldown: 5000, // 5s between separate searches
  pageCooldown: 1000, // 1s between pages
});

export const engine: SearchEngine = {
  name: "bing",
  search: searchBing,
  isRateLimited: () => isThrottled("bing"),
};
