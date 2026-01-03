/**
 * Playwright Visit E2E Tests
 * Tests the visitPage function with a real browser instance.
 */
import {
  test,
  expect,
  describe,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import {
  visitPage,
  cleanBrowserSession,
} from "../../src/engines/visit_page/visit.js";
import { McpError, ErrorCode } from "../../src/types/mcp-error.js";
import * as http from "http";
import { loadConfig } from "../../src/config/index.js";

// Mock the config loader
vi.mock("../../src/config/index.js", () => ({
  loadConfig: vi.fn().mockReturnValue({
    proxy: {
      enabled: false,
      isValid: false,
      url: "",
      error: null,
      agent: null,
    },
  }),
}));

// Mock URL validation to allow localhost for tests
vi.mock("../../src/utils/isValidUrl.js", () => ({
  isValidBrowserUrl: (url: string) => /^https?:/i.test(url),
}));

let server: http.Server;
let serverUrl: string;

// Mini HTTP server for testing
function createTestServer(): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);

      switch (url.pathname) {
        case "/empty":
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<html><body><h1>Hi</h1></body></html>");
          break;

        case "/bot-protection":
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <head><title>Test Page</title></head>
              <body>
                <div id="challenge-running">Security Challenge</div>
                <p>This is sufficient content to avoid the insufficient content check while testing bot protection detection.</p>
                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
              </body>
            </html>
          `);
          break;

        case "/suspicious":
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <head><title>Security Check Required</title></head>
              <body>
                <p>This is sufficient content to avoid the insufficient content check while testing suspicious title detection.</p>
                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
              </body>
            </html>
          `);
          break;

        case "/normal":
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <head><title>Test Page Title</title></head>
              <body>
                <main>
                  <h1>Welcome to Test Page</h1>
                  <p>This is a test page with sufficient content to pass validation.</p>
                  <p>It has multiple paragraphs and enough text to meet the word count requirement.</p>
                  <a href="https://example.com">Test link</a>
                </main>
              </body>
            </html>
          `);
          break;

        case "/redirect":
          res.writeHead(301, { Location: "/normal" });
          res.end();
          break;

        case "/connection-reset":
          // Simulate a failed connection by destroying the socket
          res.socket?.destroy();
          break;

        default:
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not Found");
      }
    });

    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, url: `http://localhost:${port}` });
    });
  });
}

// Utility function to fetch endpoint content directly
async function fetchEndpoint(url: string): Promise<{
  status: number;
  content: string;
  headers: Record<string, string>;
}> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const headers: Record<string, string> = {};
        Object.entries(res.headers).forEach(([key, value]) => {
          if (value) headers[key] = Array.isArray(value) ? value[0] : value;
        });

        resolve({
          status: res.statusCode || 0,
          content: data,
          headers,
        });
      });
    });

    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
  });
}

describe("Test Server Endpoint Validation", () => {
  let server: http.Server;
  let serverUrl: string;

  beforeAll(async () => {
    const result = await createTestServer();
    server = result.server;
    serverUrl = result.url;
  });

  afterAll(() => {
    server.close();
  });

  test("bot-protection endpoint is reachable and serves expected content", async () => {
    const result = await fetchEndpoint(`${serverUrl}/bot-protection`);

    expect(result.status).toBe(200);
    expect(result.content).toContain('id="challenge-running"');
    expect(result.content).toContain("Security Challenge");
    expect(result.headers["content-type"]).toContain("text/html");
  });

  test("suspicious endpoint is reachable and serves expected content", async () => {
    const result = await fetchEndpoint(`${serverUrl}/suspicious`);

    expect(result.status).toBe(200);
    expect(result.content).toContain("Security Check Required");
    expect(result.content).toContain("sufficient content");
    expect(result.headers["content-type"]).toContain("text/html");
  });

  test("normal endpoint is reachable and serves expected content", async () => {
    const result = await fetchEndpoint(`${serverUrl}/normal`);

    expect(result.status).toBe(200);
    expect(result.content).toContain("Test Page Title");
    expect(result.content).toContain("Welcome to Test Page");
    expect(result.content).toContain("Test link");
    expect(result.headers["content-type"]).toContain("text/html");
  });

  test("empty endpoint is reachable and serves expected content", async () => {
    const result = await fetchEndpoint(`${serverUrl}/empty`);

    expect(result.status).toBe(200);
    expect(result.content).toContain("<h1>Hi</h1>");
    expect(result.headers["content-type"]).toContain("text/html");
  });

  test("redirect endpoint returns 301 status", async () => {
    const result = await fetchEndpoint(`${serverUrl}/redirect`);

    expect(result.status).toBe(301);
    expect(result.headers["location"]).toBe("/normal");
  });

  test("non-existent endpoint returns 404", async () => {
    const result = await fetchEndpoint(`${serverUrl}/nonexistent`);

    expect(result.status).toBe(404);
    expect(result.content).toBe("Not Found");
  });
});

describe("visitPage", { timeout: 30000 }, () => {
  beforeAll(async () => {
    const result = await createTestServer();
    server = result.server;
    serverUrl = result.url;
  });

  afterAll(async () => {
    server.close();
  });

  test("successfully visits a normal page", async () => {
    const result = await visitPage(`${serverUrl}/normal`);

    expect(result.url).toBe(`${serverUrl}/normal`);
    expect(result.title).toBe("Test Page Title");
    expect(result.content).toContain("Welcome to Test Page");
    expect(result.content).toContain("Test link");
    expect(result.screenshot).toBeUndefined();
  });

  test("takes screenshot when requested", async () => {
    const result = await visitPage(`${serverUrl}/normal`, true);

    expect(result.screenshot).toBeDefined();
    expect(typeof result.screenshot).toBe("string");
    expect(result.screenshot).toContain("test_page_title");
  });

  test("rejects invalid URL protocols", async () => {
    await expect(visitPage("ftp://example.com")).rejects.toThrow(
      new McpError(
        ErrorCode.InvalidRequest,
        "Invalid URL: Only http/https protocols supported",
      ),
    );

    await expect(visitPage("mailto:test@example.com")).rejects.toThrow(
      new McpError(
        ErrorCode.InvalidRequest,
        "Invalid URL: Only http/https protocols supported",
      ),
    );
  });

  test("handles connection failures gracefully", async () => {
    // Use the local /connection-reset endpoint that destroys the socket
    // This simulates network errors without external DNS lookups
    await expect(visitPage(`${serverUrl}/connection-reset`)).rejects.toThrow(
      expect.objectContaining({
        code: ErrorCode.InternalError,
        message: expect.stringMatching(
          /Navigation failed|net::ERR_CONNECTION_REFUSED|net::ERR_CONNECTION_RESET|net::ERR_EMPTY_RESPONSE/,
        ),
      }),
    );
  });

  test("detects bot protection", async () => {
    await expect(visitPage(`${serverUrl}/bot-protection`)).rejects.toThrow(
      expect.objectContaining({
        code: ErrorCode.InternalError,
        message: expect.stringContaining("Bot protection detected"),
      }),
    );
  });

  test("detects suspicious titles", async () => {
    await expect(visitPage(`${serverUrl}/suspicious`)).rejects.toThrow(
      expect.objectContaining({
        code: ErrorCode.InternalError,
        message: expect.stringContaining("Suspicious title"),
      }),
    );
  });

  test("rejects pages with insufficient content", async () => {
    await expect(visitPage(`${serverUrl}/empty`)).rejects.toThrow(
      expect.objectContaining({
        code: ErrorCode.InternalError,
        message: expect.stringContaining(
          "Navigation failed: Insufficient content",
        ),
      }),
    );
  });

  test("handles redirects gracefully", async () => {
    const result = await visitPage(`${serverUrl}/redirect`);

    expect(result.url).toBe(`${serverUrl}/redirect`);
    expect(result.title).toBe("Test Page Title");
    expect(result.content).toContain("Welcome to Test Page");
  });

  test("cleans up browser resources", async () => {
    await visitPage(`${serverUrl}/normal`);
    const seeBoolean = await cleanBrowserSession();

    expect(seeBoolean).toBe(true);

    // Browser should be closed after cleanup
    // This is more of a smoke test to ensure cleanup doesn't throw
    expect(async () => await cleanBrowserSession()).not.toThrow();
  });
});
