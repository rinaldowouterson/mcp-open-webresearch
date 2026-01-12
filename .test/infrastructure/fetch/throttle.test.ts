/**
 * Centralized throttle module unit tests.
 * Tests the throttle functions in isolation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as throttle from "../../../src/infrastructure/search/throttle.js";

describe("Throttle Module", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    throttle.clearThrottle();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("setThrottle and isThrottled", () => {
    it("returns false when no config set", () => {
      expect(throttle.isThrottled("unknown")).toBe(false);
    });

    it("returns false when searchCooldown is 0", () => {
      throttle.setThrottle("test", { searchCooldown: 0, pageCooldown: 0 });
      throttle.touch("test");
      expect(throttle.isThrottled("test")).toBe(false);
    });

    it("returns true when within searchCooldown", () => {
      throttle.setThrottle("test", { searchCooldown: 5000, pageCooldown: 0 });
      throttle.touch("test");
      expect(throttle.isThrottled("test")).toBe(true);
    });

    it("returns false after searchCooldown expires", () => {
      throttle.setThrottle("test", { searchCooldown: 5000, pageCooldown: 0 });
      throttle.touch("test");

      vi.advanceTimersByTime(5001);

      expect(throttle.isThrottled("test")).toBe(false);
    });
  });

  describe("cooldown", () => {
    it("resolves immediately when pageCooldown is 0", async () => {
      throttle.setThrottle("test", { searchCooldown: 0, pageCooldown: 0 });
      throttle.touch("test");

      const start = Date.now();
      await throttle.cooldown("test");
      const elapsed = Date.now() - start;

      expect(elapsed).toBe(0);
    });

    it("waits for remaining pageCooldown", async () => {
      throttle.setThrottle("test", { searchCooldown: 0, pageCooldown: 1000 });
      throttle.touch("test");

      // Advance 200ms
      vi.advanceTimersByTime(200);

      // Start cooldown - should wait ~800ms
      const cooldownPromise = throttle.cooldown("test");

      // Advance 500ms - still waiting
      vi.advanceTimersByTime(500);

      // Advance past remaining time
      vi.advanceTimersByTime(400);

      await cooldownPromise;
    });

    it("resolves immediately if pageCooldown already elapsed", async () => {
      throttle.setThrottle("test", { searchCooldown: 0, pageCooldown: 1000 });
      throttle.touch("test");

      // Wait longer than cooldown
      vi.advanceTimersByTime(1500);

      await throttle.cooldown("test");
    });
  });

  describe("touch", () => {
    it("updates lastUsed time", () => {
      throttle.setThrottle("test", { searchCooldown: 1000, pageCooldown: 0 });

      expect(throttle.isThrottled("test")).toBe(false);

      throttle.touch("test");

      expect(throttle.isThrottled("test")).toBe(true);
    });
  });

  describe("throttleTimeRemaining", () => {
    it("returns 0 when not throttled", () => {
      throttle.setThrottle("test", { searchCooldown: 5000, pageCooldown: 0 });
      expect(throttle.throttleTimeRemaining("test")).toBe(0);
    });

    it("returns remaining cooldown time", () => {
      throttle.setThrottle("test", { searchCooldown: 5000, pageCooldown: 0 });
      throttle.touch("test");

      vi.advanceTimersByTime(2000);

      const remaining = throttle.throttleTimeRemaining("test");
      expect(remaining).toBe(3000);
    });
  });

  describe("resetThrottle", () => {
    it("clears lastUsed but keeps configs", () => {
      throttle.setThrottle("test", { searchCooldown: 5000, pageCooldown: 0 });
      throttle.touch("test");

      expect(throttle.isThrottled("test")).toBe(true);

      throttle.resetThrottle();

      // Not throttled because lastUsed cleared
      expect(throttle.isThrottled("test")).toBe(false);
    });
  });
});

describe("Throttle Integration with Engine Fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    throttle.clearThrottle();
  });

  it("engines can check throttle state", () => {
    // Simulate brave configuration
    throttle.setThrottle("brave", { searchCooldown: 5000, pageCooldown: 1000 });

    // Initially not throttled
    expect(throttle.isThrottled("brave")).toBe(false);

    // Mark as used
    throttle.touch("brave");

    // Now throttled
    expect(throttle.isThrottled("brave")).toBe(true);
  });
});
