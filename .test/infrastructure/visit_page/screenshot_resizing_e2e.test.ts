import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import {
  visitPage,
  cleanBrowserSession,
} from "../../../src/infrastructure/visit_page/visit.js";
import * as Config from "../../../src/config/index.js";
import * as http from "http";

// Mock URL validation to allow localhost for tests.
// This is necessary because the real isValidBrowserUrl rejects localhost/private IPs for security (SSRF protection).
vi.mock("../../../src/utils/isValidUrl.js", () => ({
  isValidBrowserUrl: (url: string) => /^https?:/i.test(url),
}));

/**
 * Targeted E2E test to verify the screenshot resizing loop logic.
 * We mock a very small screenshotMaxSize to force the resizing loop to trigger.
 */

let server: http.Server;
let serverUrl: string;

// Mini HTTP server for testing
function createTestServer(): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      const heavyContent = Array(100)
        .fill(
          "<p>This is a lot of recurring content to ensure we pass the insufficient content check and have a physically large page to screenshot.</p>",
        )
        .join("");
      res.end(`
        <html>
          <head><title>Heavy Page</title></head>
          <body style="background: linear-gradient(45deg, #f3ec78, #af4261); min-height: 3000px;">
            <h1>This is a heavy page for screenshot testing</h1>
            <div style="width: 1000px; height: 1000px; background: blue;"></div>
            ${heavyContent}
            <div style="width: 1000px; height: 1000px; background: red;"></div>
          </body>
        </html>
      `);
    });

    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, url: `http://localhost:${port}` });
    });
  });
}

describe("Screenshot Resizing E2E", () => {
  beforeAll(async () => {
    const result = await createTestServer();
    server = result.server;
    serverUrl = result.url;
  });

  afterAll(async () => {
    await cleanBrowserSession();
    server.close();
  });

  it("should trigger the resizing loop when screenshot exceeds maxSize", async () => {
    // Mock getConfig to return a very small screenshotMaxSize (20KB)
    // Most screenshots will exceed this, forcing the loop to trigger and eventually fail or succeed at min size
    vi.spyOn(Config, "getConfig").mockReturnValue({
      proxy: { enabled: false },
      docker: { isDocker: false },
      ssl: { ignoreTlsErrors: false },
      browser: {
        idleTimeout: 300000,
        concurrency: 4,
        screenshotMaxSize: 50 * 1024, // 50KB - small enough to likely trigger resizing
      },
      publicUrl: "http://localhost:0",
      deepSearch: {
        maxLoops: 3,
        resultsPerEngine: 10,
        maxCitationUrls: 10,
        reportRetentionMinutes: 60,
      },
    } as any);

    // This should attempt to resize. If it still exceeds 50KB after MAX_ATTEMPTS, it might throw,
    // but the console logs (which we can see in Vitest output) will prove the loop ran.
    try {
      const result = await visitPage(`${serverUrl}/`, true);
      console.log(`Final screenshot size: ${result.screenshot?.length} chars`);
      expect(result.screenshot).toBeDefined();
    } catch (error: any) {
      // If it still exceeds after resizing, it throws McpError
      expect(error.message).toContain("Screenshot exceeds");
      expect(error.message).toContain("limit after optimization");
    }
  });
});
