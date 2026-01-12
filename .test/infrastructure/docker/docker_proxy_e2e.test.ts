import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  visitPage,
  cleanBrowserSession,
} from "../../../src/infrastructure/visit_page/visit.js";
import * as fs from "fs";
import * as path from "path";

const TEST_URL_HTTPS = "https://example.com/";

// This test suite relies on the environment being set up by docker_launcher_test.sh
// capable of transparently proxying or handling HTTPS via MITM with a system-trusted CA.
describe("Docker Proxy E2E Tests (System CA)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    await cleanBrowserSession();
  });

  it("should successfully visit an HTTPS page through the MITM proxy without extra configuration", async () => {
    // Verify we are in the expected environment
    if (process.env.NODE_USE_SYSTEM_CA !== "1") {
      console.warn("Skipping test: NODE_USE_SYSTEM_CA is not set to 1");
      return;
    }

    console.log(`Using Proxy: ${process.env.HTTPS_PROXY}`);
    console.log(`System CA Mode: ${process.env.NODE_USE_SYSTEM_CA}`);

    // The browser launched by visitPage should automatically pick up the system certificates
    // because we are in a container where they have been updated.
    // We do not need to pass extra cert paths to the browser or node if it works as intended.

    try {
      const result = await visitPage(TEST_URL_HTTPS);

      // Basic verification of access
      expect(result.url).toBe(TEST_URL_HTTPS);
      expect(result.content).toContain("Example Domain");
    } catch (e: any) {
      console.error("Visit failed:", e);
      throw e;
    }
  }, 30000);
});
