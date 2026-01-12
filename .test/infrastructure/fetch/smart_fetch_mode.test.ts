/**
 * Smart Fetch Mode Tests
 * Verifies smartFetch behaves correctly in browserMode vs standard mode against a local mock server.
 * Uses mockttp to provide a local HTTPS server and inspect incoming request headers.
 */
import {
  test,
  expect,
  describe,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import * as mockttp from "mockttp";
import { ensureTestCerts } from "../../utils/testCerts.js";

// We need to verify that smartFetch actually changes behavior (headers/TLS)
// To do this locally properly, we use a local HTTPS server and check the User-Agent.

describe("Smart Fetch Modes (Local Integration)", () => {
  let mockServer: mockttp.Mockttp;
  const { key, cert } = ensureTestCerts();

  beforeAll(async () => {
    // Create a local HTTPS server
    mockServer = mockttp.getLocal({
      https: { key, cert },
    });
    await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  beforeEach(() => {
    vi.resetModules();
    mockServer.reset();
  });

  // Helper to load smartFetch with specific config
  async function loadSmartFetchWithConfig(ignoreTls: boolean) {
    // Mock the config to ensure ignoreTlsErrors matches our needs (mockttp uses self-signed/test certs)
    vi.doMock("../../../src/config/index.js", () => ({
      getConfig: () => ({
        proxy: { enabled: false },
        ssl: { ignoreTlsErrors: ignoreTls },
      }),
    }));

    const { smartFetch } =
      await import("../../../src/infrastructure/fetch/client.js");
    return smartFetch;
  }

  test("browserMode: true sends Chrome-like User-Agent", async () => {
    const smartFetch = await loadSmartFetchWithConfig(true);
    const endpoint = await mockServer
      .forGet("/browser-test")
      .thenReply(200, "ok");

    const response = await smartFetch(mockServer.url + "/browser-test", {
      browserMode: true,
    });

    expect(response).toBe("ok");

    const requests = await endpoint.getSeenRequests();
    expect(requests.length).toBe(1);

    const ua = requests[0].headers["user-agent"];

    // Impit with browser: 'chrome' MUST send a Chrome User-Agent
    expect(ua).toBeDefined();
    // Should look like "Mozilla/5.0 (...) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/..."
    expect(ua).toContain("Chrome/");
    expect(ua).toContain("Mozilla/5.0");
    expect(ua).not.toMatch(/axios/i);

    // Verify "Corporate Grade" Emulation: Check for Client Hints and Fetch Metadata
    // These are critical for passing anti-bot checks
    expect(requests[0].headers["sec-ch-ua"]).toBeDefined();
    expect(requests[0].headers["sec-ch-ua-mobile"]).toBeDefined();
    expect(requests[0].headers["sec-ch-ua-platform"]).toBeDefined();
    expect(requests[0].headers["sec-fetch-site"]).toBeDefined();
    expect(requests[0].headers["sec-fetch-mode"]).toBeDefined();
    expect(requests[0].headers["sec-fetch-dest"]).toBeDefined();
    expect(ua).toContain("Mozilla/5.0");
    expect(ua).not.toMatch(/axios/i);
  });

  test("browserMode: false sends standard User-Agent (NOT Chrome)", async () => {
    const smartFetch = await loadSmartFetchWithConfig(true);
    const endpoint = await mockServer
      .forGet("/standard-test")
      .thenReply(200, "ok");

    const response = await smartFetch(mockServer.url + "/standard-test", {
      browserMode: false,
    });

    expect(response).toBe("ok");

    const requests = await endpoint.getSeenRequests();
    expect(requests.length).toBe(1);

    const ua = requests[0].headers["user-agent"];

    // Impit without browser emulation sends NO User-Agent header by default
    expect(ua).toBeUndefined();
  });

  test("handles HTTP errors correctly", async () => {
    const smartFetch = await loadSmartFetchWithConfig(true);
    await mockServer.forGet("/error").thenReply(404, "Not Found");

    await expect(smartFetch(mockServer.url + "/error")).rejects.toThrow(
      "HTTP Error: 404",
    );
  });
});
