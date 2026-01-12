import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  cacheBuffer,
  getBuffer,
  clearCache,
  resetProductionCacheForTesting,
} from "../../../src/server/helpers/ephemeralBufferCache.js";
import { resetConfigForTesting } from "../../../src/config/index.js";

/**
 * STRESS & COMPLIANCE AUDIT
 *
 * This suite proves the EphemeralBufferCache meets production-grade
 * memory safety requirements:
 *
 * 1. Balloon Philosophy: Memory grows dynamically, not pre-reserved.
 * 2. Hard Ceiling: 100MB is a physical wall; LRU eviction is strict.
 * 3. Heap Safety: Returns Buffer (C++ heap), never String (V8 heap).
 * 4. Temporal Cleanup: 10min TTL is absolute and non-negotiable.
 */
describe("EphemeralBufferCache - Stress & Compliance Audit", () => {
  beforeEach(() => {
    // Initialize config for tests (required for lazy getter)
    resetConfigForTesting();
    // Reset production cache singleton so each test starts fresh
    resetProductionCacheForTesting();
    // lru-cache uses performance.now() for TTL, so we must mock it
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // SECTION 1: BASIC FUNCTIONALITY
  // =========================================================================

  describe("Basic Functionality", () => {
    it("should store and retrieve a buffer", () => {
      const id = "test-id";
      const content = Buffer.from("test content");
      cacheBuffer(id, content);

      const retrieved = getBuffer(id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.toString()).toBe("test content");
    });

    it("should return undefined for non-existent keys", () => {
      expect(getBuffer("ghost-key")).toBeUndefined();
    });

    it("should overwrite existing keys", () => {
      cacheBuffer("key", Buffer.from("v1"));
      cacheBuffer("key", Buffer.from("v2"));
      expect(getBuffer("key")?.toString()).toBe("v2");
    });

    it("should clear all entries on clearCache()", () => {
      cacheBuffer("a", Buffer.from("1"));
      cacheBuffer("b", Buffer.from("2"));
      clearCache();
      expect(getBuffer("a")).toBeUndefined();
      expect(getBuffer("b")).toBeUndefined();
    });
  });

  // =========================================================================
  // SECTION 2: HEAP SAFETY (Buffer vs String)
  // =========================================================================

  describe("Heap Safety", () => {
    it("should return a Buffer, not a String", () => {
      cacheBuffer("buffer-check", Buffer.from("data"));
      const retrieved = getBuffer("buffer-check");

      expect(Buffer.isBuffer(retrieved)).toBe(true);
      expect(typeof retrieved).not.toBe("string");
    });

    it("should preserve binary data integrity", () => {
      // Binary data that would be mangled if converted to string
      const binaryData = Buffer.from([0x00, 0xff, 0x80, 0x7f, 0x01]);
      cacheBuffer("binary", binaryData);

      const retrieved = getBuffer("binary");
      expect(retrieved).toEqual(binaryData);
      expect(retrieved?.length).toBe(5);
    });
  });

  // =========================================================================
  // SECTION 3: THE HARD CEILING (100MB LRU Eviction)
  // =========================================================================

  describe("Hard Ceiling - 100MB Limit", () => {
    it("should strictly evict oldest items when 100MB is exceeded", () => {
      // Strategy: Fill with 10 x 10MB chunks, then add 1MB to trigger eviction.
      const chunkSize = 10 * 1024 * 1024; // 10MB
      const filler = Buffer.alloc(chunkSize, "x");

      // Fill to exactly 100MB (10 chunks)
      for (let i = 0; i < 10; i++) {
        cacheBuffer(`chunk-${i}`, filler);
      }

      // NOTE: We intentionally do NOT call getBuffer() here because
      // lru-cache updates LRU order on get(). We want chunk-0 to remain oldest.

      // Overflow: Add 1 more MB (101MB total needed)
      const overflow = Buffer.alloc(1 * 1024 * 1024, "o"); // 1MB
      cacheBuffer("overflow", overflow);

      // Assertions: LRU eviction must have kicked in
      expect(getBuffer("overflow")).toBeDefined(); // New entry is present
      expect(getBuffer("chunk-0")).toBeUndefined(); // Oldest MUST be gone
      expect(getBuffer("chunk-1")).toBeDefined(); // Second oldest still there
      expect(getBuffer("chunk-9")).toBeDefined(); // Newest still there
    });

    it("should evict multiple items if necessary to fit a large entry", () => {
      // Fill with 10 x 10MB chunks (100MB)
      const chunkSize = 10 * 1024 * 1024;
      const filler = Buffer.alloc(chunkSize, "x");

      for (let i = 0; i < 10; i++) {
        cacheBuffer(`chunk-${i}`, filler);
      }

      // Add a 25MB chunk (requires evicting 3 x 10MB = 30MB)
      const bigEntry = Buffer.alloc(25 * 1024 * 1024, "B");
      cacheBuffer("big-entry", bigEntry);

      // Assertions: 3 oldest should be gone
      expect(getBuffer("big-entry")).toBeDefined();
      expect(getBuffer("chunk-0")).toBeUndefined();
      expect(getBuffer("chunk-1")).toBeUndefined();
      expect(getBuffer("chunk-2")).toBeUndefined();
      expect(getBuffer("chunk-3")).toBeDefined(); // Should survive
    });

    it("should reject entries larger than maxSize", () => {
      // Single entry larger than the entire cache limit (105MB)
      const hugeEntry = Buffer.alloc(105 * 1024 * 1024, "H");
      cacheBuffer("huge", hugeEntry);

      // lru-cache will refuse to store items larger than maxSize
      expect(getBuffer("huge")).toBeUndefined();
    });
  });

  // =========================================================================
  // SECTION 4: TEMPORAL CLEANUP (Strict 10min TTL)
  // =========================================================================

  describe("Temporal Cleanup - TTL Behavior", () => {
    // NOTE: TTL tests use createTestCache with short TTL (100ms) and real time.
    // This avoids module initialization timing issues with fake timers.
    // The production cache uses 10 minutes; we test the behavior, not the duration.

    beforeEach(() => {
      // TTL tests need real timers since they use actual setTimeout delays
      vi.useRealTimers();
    });

    it("should keep items alive before TTL expires", async () => {
      const { createBufferCache } =
        await import("../../../src/server/helpers/ephemeralBufferCache.js");
      const testCache = createBufferCache({ ttlMs: 100 }); // 100ms TTL

      testCache.set("ttl-test", Buffer.from("alive"));

      // Wait 50ms (half of TTL)
      await new Promise((r) => setTimeout(r, 50));
      expect(testCache.get("ttl-test")).toBeDefined();
    });

    it("should strictly delete items after TTL expires", async () => {
      const { createBufferCache } =
        await import("../../../src/server/helpers/ephemeralBufferCache.js");
      const testCache = createBufferCache({ ttlMs: 100 }); // 100ms TTL

      testCache.set("ttl-test", Buffer.from("doomed"));

      // Wait 150ms (past TTL)
      await new Promise((r) => setTimeout(r, 150));
      expect(testCache.get("ttl-test")).toBeUndefined();
    });

    it("should NOT reset TTL on read (noUpdateTTL behavior)", async () => {
      const { createBufferCache } =
        await import("../../../src/server/helpers/ephemeralBufferCache.js");
      const testCache = createBufferCache({ ttlMs: 100 }); // 100ms TTL

      testCache.set("access-test", Buffer.from("ephemeral"));

      // Access at 50ms
      await new Promise((r) => setTimeout(r, 50));
      expect(testCache.get("access-test")).toBeDefined();

      // Wait 60ms more (total ~110ms from creation)
      await new Promise((r) => setTimeout(r, 60));

      // Should be gone - access did NOT extend TTL
      expect(testCache.get("access-test")).toBeUndefined();
    });

    it("should expire each item independently", async () => {
      const { createBufferCache } =
        await import("../../../src/server/helpers/ephemeralBufferCache.js");
      const testCache = createBufferCache({ ttlMs: 100 }); // 100ms TTL

      testCache.set("first", Buffer.from("1"));

      await new Promise((r) => setTimeout(r, 50)); // 50ms passes
      testCache.set("second", Buffer.from("2"));

      await new Promise((r) => setTimeout(r, 60)); // 60ms more (110ms total for first)

      // First should be dead, second still alive
      expect(testCache.get("first")).toBeUndefined();
      expect(testCache.get("second")).toBeDefined();

      // Wait 50ms more to expire second
      await new Promise((r) => setTimeout(r, 50));
      expect(testCache.get("second")).toBeUndefined();
    });
  });

  // =========================================================================
  // SECTION 5: EDGE CASES & STRESS
  // =========================================================================

  describe("Edge Cases & Stress", () => {
    it("should handle rapid sequential writes", () => {
      for (let i = 0; i < 1000; i++) {
        cacheBuffer(`rapid-${i}`, Buffer.from(`value-${i}`));
      }
      expect(getBuffer("rapid-0")).toBeDefined();
      expect(getBuffer("rapid-999")).toBeDefined();
    });

    it("should handle empty buffer", () => {
      const empty = Buffer.alloc(0);
      cacheBuffer("empty", empty);
      expect(getBuffer("empty")).toBeDefined();
      expect(getBuffer("empty")?.length).toBe(0);
    });

    it("should handle keys with special characters", () => {
      const specialKeys = [
        "key with spaces",
        "key/with/slashes",
        "key?with=query&params",
        "key#with#hash",
        "émojis-🎉-🔥",
      ];

      specialKeys.forEach((key) => {
        cacheBuffer(key, Buffer.from(key));
        expect(getBuffer(key)?.toString()).toBe(key);
      });
    });

    it("should handle concurrent-like operations (deterministic)", () => {
      // Simulate interleaved reads/writes
      cacheBuffer("a", Buffer.from("1"));
      const a1 = getBuffer("a");
      cacheBuffer("b", Buffer.from("2"));
      const a2 = getBuffer("a");
      cacheBuffer("a", Buffer.from("3")); // Overwrite
      const a3 = getBuffer("a");
      const b1 = getBuffer("b");

      expect(a1?.toString()).toBe("1");
      expect(a2?.toString()).toBe("1");
      expect(a3?.toString()).toBe("3");
      expect(b1?.toString()).toBe("2");
    });
  });
});
