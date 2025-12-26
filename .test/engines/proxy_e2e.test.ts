import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as mockttp from "mockttp";
import socks5 from "simple-socks";
import * as fs from "fs";
import * as path from "path";

const TEST_URL_HTTP = "http://example.com/";
const TEST_URL_HTTPS = "https://example.com/";

describe("Proxy E2E Tests", () => {
    // These tests spin up local proxies (mockttp/simple-socks) which conflicts with
    // the complexities of the Docker test environment (binding, routing).
    // Validated locally.
    // We want to run these in Docker now to verify the SOCKS bridge.
    if (process.env.DOCKER_ENVIRONMENT === "true") {
        console.log("Running local proxy tests inside Docker container...");
    }
  
  let proxyServer: mockttp.Mockttp | undefined;
  let socksServer: any;

  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment variables and modules before each test
    process.env = { ...originalEnv };
    // Explicitly unset global variables that might have been picked up from Docker environment
    // if we are simulating "fresh" runs. But we want originalEnv to be the baseline.
    // If the test environment sets HTTP_PROXY, originalEnv has it.
    // Tests override it later. We just need to make sure we reset back to originalEnv.
    vi.resetModules();
  });

  afterEach(async () => {
    if (proxyServer) {
      await proxyServer.stop();
      proxyServer = undefined;
    }
    if (socksServer) {
      socksServer.close();
      socksServer = undefined;
    }
    // Clean up any browser instances
    const { cleanBrowserSession } = await import("../../src/engines/visit_page/visit.js");
    await cleanBrowserSession();
  });

  it("should route traffic through an HTTP proxy", async () => {
    proxyServer = mockttp.getLocal();
    await proxyServer.start();
    // Force usage of 127.0.0.1 to avoid localhost resolution issues
    const proxyUrl = proxyServer.url.replace("localhost", "127.0.0.1");

    const mockedEndpoint = await proxyServer.forAnyRequest().thenPassThrough();

    process.env.ENABLE_PROXY = "true";
    process.env.HTTP_PROXY = proxyUrl;
    // loader.ts prioritizes HTTPS_PROXY, which is set in Docker environment.
    // We must unset it to ensure HTTP_PROXY is picked up.
    delete process.env.HTTPS_PROXY; 
    delete process.env.SOCKS5_PROXY;
    
    console.log("DEBUG: Proxy URL:", proxyUrl);
    console.log("DEBUG: Env HTTP_PROXY:", process.env.HTTP_PROXY);
    console.log("DEBUG: Env HTTPS_PROXY:", process.env.HTTPS_PROXY);
    console.log("DEBUG: Env SOCKS5_PROXY:", process.env.SOCKS5_PROXY);
    console.log("DEBUG: Env ENABLE_PROXY:", process.env.ENABLE_PROXY);

    vi.resetModules(); // Force config reload
    const { visitPage } = await import("../../src/engines/visit_page/visit.js");

    const result = await visitPage(TEST_URL_HTTP);
    expect(result.content).toContain("Example Domain");

    const seenRequests = await mockedEndpoint.getSeenRequests();
    console.log("DEBUG: Seen requests:", seenRequests.map(r => r.url));
    
    // We expect at least one request to the target URL. 
    // The browser might make other requests (favicon, etc) or retries.
    expect(seenRequests.length).toBeGreaterThanOrEqual(1);
    
    const targetRequest = seenRequests.find(r => r.url === TEST_URL_HTTP || r.url === TEST_URL_HTTP.slice(0, -1));
    expect(targetRequest).toBeDefined();
  }, 30000);

  it("should route traffic through a SOCKS5 proxy (no authentication)", () => {
    return new Promise<void>((resolve, reject) => {
      const socksPort = 0; // Dynamic
      socksServer = socks5.createServer();
      let proxyConnected = false;

      socksServer.on("proxyConnect", () => {
        proxyConnected = true;
      });

      socksServer.listen(socksPort, "127.0.0.1", async () => {
        const address = socksServer.address();
        const port = address.port;
        try {
          process.env.ENABLE_PROXY = "true";
          process.env.SOCKS5_PROXY = `socks5://127.0.0.1:${port}`;

          vi.resetModules(); // Force config reload
          const { visitPage } = await import("../../src/engines/visit_page/visit.js");

          const result = await visitPage(TEST_URL_HTTP);
          expect(result.content).toContain("Example Domain");
          
          if (!proxyConnected) {
            reject(new Error("Page visited but SOCKS proxy was NOT used"));
          } else {
            resolve();
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  }, 30000);


  it("should successfully route traffic using SOCKS5 proxy with authentication (via bridge)", () => {
    return new Promise<void>((resolve, reject) => {
      const socksPort = 0; // Dynamic
      let authAttempts = 0;
      let authSuccess = false;
      let proxyConnected = false;

      socksServer = socks5.createServer({
        authenticate: (username, password, socket, callback) => {
          authAttempts++;
          if (username === "user123" && password === "pass456") {
            authSuccess = true;
            callback();
          } else {
            callback(new Error("Authentication failed"));
          }
        }
      });

      socksServer.on("proxyConnect", () => {
        proxyConnected = true;
      });

      socksServer.listen(socksPort, "127.0.0.1", async () => {
        const address = socksServer.address();
        const port = address.port;
        try {
          process.env.ENABLE_PROXY = "true";
          const username = "user123";
          const password = "pass456";
          process.env.SOCKS5_PROXY = `socks5://${username}:${password}@127.0.0.1:${port}`;

          vi.resetModules(); // Force config reload
          const { visitPage } = await import("../../src/engines/visit_page/visit.js");

          // Chromium does not support SOCKS5 authentication natively.
          // However, we implemented a bridge (proxy-chain) that handles this.
          // So we verify that it now SUCCEEDS.
          const result = await visitPage(TEST_URL_HTTP);
          expect(result.content).toContain("Example Domain");
          
          if (!authSuccess) {
            reject(new Error("Page visited but SOCKS proxy authentication NOT performed"));
          }
          if (!proxyConnected) {
             reject(new Error("Page visited but SOCKS proxy was NOT used"));
          } 
          resolve(); 
        } catch (error) {
           // If it throws something else, we let it bubble up
           reject(error);
        }
      });
    });
  }, 30000);

  it("should prioritize SOCKS5 over HTTP proxy", async () => {
    // Start an HTTP proxy that will fail the test if used
    const httpProxy = mockttp.getLocal();
    await httpProxy.start();
    const httpMockedEndpoint = await httpProxy
      .forAnyRequest()
      .thenReply(500, "Should not have been called");

    // Start a SOCKS proxy that should be used
    const socksPort = 0; // Dynamic
    
    let socksConnected = false;
    let assignedPorts = 0;
    const socksPromise = new Promise<void>((resolve) => {
      socksServer = socks5.createServer();
      socksServer.on("proxyConnect", () => {
        socksConnected = true;
      });
      socksServer.listen(socksPort, "127.0.0.1", () => {
          const address = socksServer.address();
          assignedPorts = address.port;
          resolve();
      });
    });
    await socksPromise;

    process.env.ENABLE_PROXY = "true";
    process.env.SOCKS5_PROXY = `socks5://127.0.0.1:${assignedPorts}`; // This should be picked
    process.env.HTTP_PROXY = httpProxy.url; // This should be ignored

    vi.resetModules();
    const { visitPage } = await import("../../src/engines/visit_page/visit.js");

    const result = await visitPage(TEST_URL_HTTP);
    expect(result.content).toContain("Example Domain");

    // Ensure the HTTP proxy was not used
    const seenHttpRequests = await httpMockedEndpoint.getSeenRequests();
    expect(seenHttpRequests.length).toBe(0);
    
    // Ensure the SOCKS proxy WAS used
    expect(socksConnected).toBe(true);

    await httpProxy.stop();
  }, 30000);

});
