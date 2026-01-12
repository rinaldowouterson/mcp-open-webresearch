import type { SearchEngine } from "../../../types/search.js";
import { searchBrave } from "./brave.js";
import { setThrottle, isThrottled } from "../throttle.js";

// Configure Brave's throttle settings
setThrottle("brave", {
  searchCooldown: 5000,  // 5s between separate searches
  pageCooldown: 1000,    // 1s between pages
});

export const engine: SearchEngine = {
  name: "brave",
  search: searchBrave,
  isRateLimited: () => isThrottled("brave"),
};
