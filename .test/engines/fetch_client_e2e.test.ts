/**
 * Fetch Client E2E Tests
 * Tests real network requests through proxies and auth.
 */
import * as fs from "fs";
import * as path from "path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as http from "http";
import * as net from "net";
import * as mockttp from "mockttp";
import socks5 from "simple-socks";
import { ensureTestCerts } from "../utils/testCerts.js";

// Helper to wait for the socks server to be ready
const createSocksServer = (port: number, options: any = {}): Promise<any> => {
  return new Promise((resolve) => {
    const server = socks5.createServer(options);
    server.listen(port, "localhost", () => {
      resolve(server);
    });
  });
};

const createHttpProxy = (
  port: number,
  onConnect: (url: string, headers: http.IncomingHttpHeaders) => void,
): Promise<http.Server> => {
  const proxy = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("okay");
  });

  proxy.on("connect", (req, clientSocket, head) => {
    if (req.url) {
      onConnect(req.url, req.headers);
      const [hostname, portStr] = req.url.split(":");
      const port = parseInt(portStr, 10) || 443;

      const serverSocket = net.connect(port, hostname, () => {
        clientSocket.write(
          "HTTP/1.1 200 Connection Established\r\n" +
            "Proxy-agent: Node.js-Proxy\r\n" +
            "\r\n",
        );
        serverSocket.write(head);
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
      });
      serverSocket.on("error", (err) => {
        console.error(`Local Proxy Upstream Error (${hostname}:${port}):`, err);
        clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      });

      serverSocket.on("error", () => {
        clientSocket.end();
      });
      clientSocket.on("error", () => {
        serverSocket.end();
      });
    }
  });

  return new Promise<http.Server>((resolve) => {
    proxy.listen(port, "127.0.0.1", () => resolve(proxy));
  });
};

describe("Fetch Engines E2E Tests", () => {
  // These tests involve creating local proxies.
  // In Docker, we must ensure we don't conflict with system proxies.
  // We achieve this by explicitly unsetting colliding env vars.

  let proxyServer: mockttp.Mockttp | undefined;
  let customHttpProxy: http.Server | undefined;
  let socksServer: any;

  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env = { ...originalEnv };
    // CRITICAL: Unset system proxy vars so tests use our local test proxies
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    delete process.env.SOCKS5_PROXY;

    vi.resetModules();

    // Allow self-signed certs for our local test proxy
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    // Initialize LLM config after module reset
    const { resetConfigForTesting } = await import("../../src/config/index.js");
    resetConfigForTesting();
  });

  afterEach(async () => {
    // Reset global env vars
    process.env = { ...originalEnv };

    // Clean up servers
    if (proxyServer) {
      await proxyServer.stop();
      proxyServer = undefined;
    }
    if (customHttpProxy) {
      customHttpProxy.close();
      customHttpProxy = undefined;
    }
    if (socksServer) {
      socksServer.close();
      socksServer = undefined;
    }
  });

  it("should route Bing requests through an HTTP proxy", async () => {
    const connectedUrls: string[] = [];

    const { key, cert } = ensureTestCerts();

    proxyServer = mockttp.getLocal({
      https: { key, cert },
    });
    await proxyServer.start();

    // Mock the upstream response for bing.com
    const mockEndpoint = await proxyServer
      .forAnyRequest()
      .forHostname("www.bing.com")
      .thenReply(200, "Mock Bing Reached");

    // 127.0.0.1 is safer than localhost in some containers
    const proxyUrl = proxyServer.url.replace("localhost", "127.0.0.1");

    process.env.ENABLE_PROXY = "true";
    process.env.HTTP_PROXY = proxyUrl;
    delete process.env.HTTPS_PROXY;

    // Reinitialize config with new proxy env vars
    const { resetConfigForTesting } = await import("../../src/config/index.js");
    resetConfigForTesting();

    const { fetchBingPage } = await import("../../src/engines/fetch/index.js");

    const result = await fetchBingPage("test query", 0);
    expect(result).toBe("Mock Bing Reached");

    const seenRequests = await mockEndpoint.getSeenRequests();
    expect(seenRequests.some((r: any) => r.url.includes("bing.com"))).toBe(
      true,
    );
  });

  it("should authenticate with HTTP proxy", async () => {
    const authHeaders: string[] = [];

    customHttpProxy = await createHttpProxy(0, (url, headers) => {
      if (headers["proxy-authorization"]) {
        authHeaders.push(headers["proxy-authorization"] as string);
      }
    });

    const username = "user123";
    const password = "password456";
    const address = customHttpProxy.address() as net.AddressInfo;
    const proxyUrl = `http://${username}:${password}@127.0.0.1:${address.port}`;

    process.env.ENABLE_PROXY = "true";
    process.env.HTTP_PROXY = proxyUrl;
    delete process.env.HTTPS_PROXY;

    const { resetConfigForTesting } = await import("../../src/config/index.js");
    resetConfigForTesting();

    const { fetchBingPage } = await import("../../src/engines/fetch/index.js");

    try {
      await fetchBingPage("test query", 0);
    } catch (e) {
      /* expected */
    }

    const expectedAuth =
      "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
    expect(authHeaders).toContain(expectedAuth);
  });

  /**
   * Verify proxy configuration is correct when disabled.
   * Industry standard: test config layer, trust HTTP implementation.
   * Positive case (proxy enabled → routes through proxy) is tested above.
   */
  it("should have proxy disabled in config when ENABLE_PROXY=false", async () => {
    process.env.ENABLE_PROXY = "false";
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.SOCKS5_PROXY;

    vi.resetModules();
    const { getConfig, resetConfigForTesting } =
      await import("../../src/config/index.js");
    resetConfigForTesting();
    const config = getConfig();

    expect(config.proxy.enabled).toBe(false);
    expect(config.proxy.isValid).toBe(false);
  });

  it("should route Bing requests through a SOCKS5 proxy", async () => {
    const socksPort = 0; // 0 for random port
    socksServer = await createSocksServer(socksPort);

    let proxyConnected = false;
    socksServer.on("proxyConnect", () => {
      proxyConnected = true;
    });

    const address = socksServer.address();
    const port = address.port;

    process.env.ENABLE_PROXY = "true";
    process.env.SOCKS5_PROXY = `socks5://localhost:${port}`;

    const { resetConfigForTesting } = await import("../../src/config/index.js");
    resetConfigForTesting();

    // Re-import to load config and set agents
    const { fetchBingPage } = await import("../../src/engines/fetch/index.js");

    // We expect the request to fail (or succeed if internet is available),
    // but CRITICALLY we want to know if it tried to go through the proxy.
    try {
      await fetchBingPage("test query", 0);
    } catch (e: any) {
      // If it fails with network error that looks like proxy issue, that's fine.
    }

    // STRICT VERIFICATION: The proxy MUST have received a connection attempt.
    expect(proxyConnected).toBe(true);
  });

  it("should route Brave requests through an HTTP proxy", async () => {
    // Identical setup to Bing, but testing fetchBravePage (browserMode: true)
    const { key, cert } = ensureTestCerts();

    proxyServer = mockttp.getLocal({ https: { key, cert } });
    await proxyServer.start();

    const mockEndpoint = await proxyServer
      .forAnyRequest()
      .forHostname("search.brave.com")
      .thenReply(200, "Mock Brave Reached");
    const proxyUrl = proxyServer.url.replace("localhost", "127.0.0.1");

    process.env.ENABLE_PROXY = "true";
    process.env.HTTP_PROXY = proxyUrl;

    const { resetConfigForTesting } = await import("../../src/config/index.js");
    resetConfigForTesting();

    const { fetchBravePage } = await import("../../src/engines/fetch/index.js");

    const result = await fetchBravePage("test query", 0);
    expect(result).toBe("Mock Brave Reached");

    const seenRequests = await mockEndpoint.getSeenRequests();
    expect(seenRequests.some((r: any) => r.url.includes("brave.com"))).toBe(
      true,
    );
  });

  it("should route DuckDuckGo requests through an HTTP proxy", async () => {
    // Testing fetchDuckDuckSearchPage (browserMode: false)
    const { key, cert } = ensureTestCerts();

    proxyServer = mockttp.getLocal({ https: { key, cert } });
    await proxyServer.start();

    const mockEndpoint = await proxyServer
      .forAnyRequest()
      .forHostname("duckduckgo.com")
      .thenReply(200, "Mock DDG Reached");
    const proxyUrl = proxyServer.url.replace("localhost", "127.0.0.1");

    process.env.ENABLE_PROXY = "true";
    process.env.HTTP_PROXY = proxyUrl;

    const { resetConfigForTesting } = await import("../../src/config/index.js");
    resetConfigForTesting();

    const { fetchDuckDuckSearchPage } =
      await import("../../src/engines/fetch/index.js");

    const result = await fetchDuckDuckSearchPage("test query");
    expect(result).toBe("Mock DDG Reached");

    const seenRequests = await mockEndpoint.getSeenRequests();
    expect(
      seenRequests.some((r: any) => r.url.includes("duckduckgo.com")),
    ).toBe(true);
  });

  it("should authenticate with SOCKS5 proxy", async () => {
    const socksPort = 0;
    let authAttempts = 0;
    let success = false;

    socksServer = await createSocksServer(socksPort, {
      authenticate: (
        username: string,
        password: string,
        socket: any,
        callback: (err?: Error) => void,
      ) => {
        authAttempts++;
        if (username === "user123" && password === "pass456") {
          success = true;
          callback(); // Success
        } else {
          callback(new Error("Authentication failed"));
        }
      },
    });

    const address = socksServer.address();
    const port = address.port;

    const username = "user123";
    const password = "pass456";
    process.env.ENABLE_PROXY = "true";
    process.env.SOCKS5_PROXY = `socks5://${username}:${password}@localhost:${port}`;

    const { resetConfigForTesting } = await import("../../src/config/index.js");
    resetConfigForTesting();

    const { fetchBingPage } = await import("../../src/engines/fetch/index.js");

    try {
      await fetchBingPage("test query", 0);
    } catch (e) {
      // Expected to fail on actual request but auth should have happened
    }

    expect(authAttempts).toBeGreaterThan(0);
    expect(success).toBe(true);
  });
});

/**
 * smartPost Proxy Tests
 * Tests that smartPost (used by fetchDirectInference) respects proxy settings.
 */
describe("smartPost Proxy Tests", () => {
  let proxyServer: mockttp.Mockttp | undefined;
  let socksServer: any;

  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    delete process.env.SOCKS5_PROXY;

    vi.resetModules();

    // Allow self-signed certs for our local test proxy
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    // Initialize config after module reset
    const { resetConfigForTesting } = await import("../../src/config/index.js");
    resetConfigForTesting();
  });

  afterEach(async () => {
    process.env = { ...originalEnv };

    if (proxyServer) {
      await proxyServer.stop();
      proxyServer = undefined;
    }
    if (socksServer) {
      socksServer.close();
      socksServer = undefined;
    }
    vi.restoreAllMocks();
  });

  it("should route POST requests through an HTTP proxy", async () => {
    const { key, cert } = ensureTestCerts();

    proxyServer = mockttp.getLocal({
      https: { key, cert },
    });
    await proxyServer.start();

    // Mock an LLM API endpoint
    const mockEndpoint = await proxyServer
      .forPost("/v1/chat/completions")
      .thenReply(
        200,
        JSON.stringify({
          choices: [{ message: { content: "1, 2" } }],
        }),
      );

    const proxyUrl = proxyServer.url.replace("localhost", "127.0.0.1");

    process.env.ENABLE_PROXY = "true";
    process.env.HTTP_PROXY = proxyUrl;
    delete process.env.HTTPS_PROXY;

    // Reinitialize config with new proxy settings
    const { resetConfigForTesting } = await import("../../src/config/index.js");
    resetConfigForTesting();

    const { smartPost } = await import("../../src/engines/fetch/client.js");

    const response = await smartPost(`${proxyUrl}/v1/chat/completions`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "test", messages: [] }),
    });

    expect(response.ok).toBe(true);
    const text = await response.text();
    expect(text).toContain("choices");

    const seenRequests = await mockEndpoint.getSeenRequests();
    expect(seenRequests.length).toBe(1);
    // Verify the request was a POST with our body
    expect(seenRequests[0].method).toBe("POST");
  });

  it("should route POST requests through a SOCKS5 proxy", async () => {
    const socksPort = 0; // Dynamic
    socksServer = await createSocksServer(socksPort);

    let proxyConnected = false;
    socksServer.on("proxyConnect", () => {
      proxyConnected = true;
    });

    const address = socksServer.address();
    const port = address.port;

    process.env.ENABLE_PROXY = "true";
    process.env.SOCKS5_PROXY = `socks5://localhost:${port}`;

    // Reinitialize config with new proxy settings
    const { resetConfigForTesting } = await import("../../src/config/index.js");
    resetConfigForTesting();

    const { smartPost } = await import("../../src/engines/fetch/client.js");

    // Make a request that will go through the SOCKS proxy
    // The actual external request might fail, but we verify the proxy was used
    try {
      await smartPost("https://httpbin.org/post", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      });
    } catch (e) {
      // Network errors are expected if httpbin is unreachable
    }

    // STRICT VERIFICATION: The SOCKS proxy MUST have received a connection attempt
    expect(proxyConnected).toBe(true);
  });

  it("should authenticate with SOCKS5 proxy for POST requests", async () => {
    const socksPort = 0;
    let authAttempts = 0;
    let success = false;

    socksServer = await createSocksServer(socksPort, {
      authenticate: (
        username: string,
        password: string,
        socket: any,
        callback: (err?: Error) => void,
      ) => {
        authAttempts++;
        if (username === "apiuser" && password === "apipass") {
          success = true;
          callback();
        } else {
          callback(new Error("Authentication failed"));
        }
      },
    });

    const address = socksServer.address();
    const port = address.port;

    const username = "apiuser";
    const password = "apipass";
    process.env.ENABLE_PROXY = "true";
    process.env.SOCKS5_PROXY = `socks5://${username}:${password}@localhost:${port}`;

    const { resetConfigForTesting } = await import("../../src/config/index.js");
    resetConfigForTesting();

    const { smartPost } = await import("../../src/engines/fetch/client.js");

    try {
      await smartPost("https://httpbin.org/post", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      });
    } catch (e) {
      // Expected to fail on actual request but auth should have happened
    }

    expect(authAttempts).toBeGreaterThan(0);
    expect(success).toBe(true);
  });

  it("should NOT use proxy when proxy is disabled", async () => {
    // Create a SOCKS proxy that will fail the test if used
    const socksPort = 0;
    socksServer = await createSocksServer(socksPort);

    let proxyWasUsed = false;
    socksServer.on("proxyConnect", () => {
      proxyWasUsed = true;
    });

    const address = socksServer.address();
    const port = address.port;

    // Set proxy URL but DISABLE proxy
    process.env.ENABLE_PROXY = "false";
    process.env.SOCKS5_PROXY = `socks5://localhost:${port}`;

    const { resetConfigForTesting } = await import("../../src/config/index.js");
    resetConfigForTesting();

    const { smartPost } = await import("../../src/engines/fetch/client.js");

    // Make a request to a local test server (or any reachable endpoint)
    try {
      // This will go direct (not through proxy) since proxy is disabled
      await smartPost("https://example.com/", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      });
    } catch (e) {
      // Network errors are acceptable
    }

    // STRICT VERIFICATION: The proxy should NOT have been used
    expect(proxyWasUsed).toBe(false);
  });
});
