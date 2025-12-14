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
    if (process.env.DOCKER_ENVIRONMENT === "true") {
        it.skip("skipping local proxy tests in Docker", () => {});
        return;
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

    process.env.USE_PROXY = "true";
    process.env.HTTP_PROXY = proxyUrl;

    vi.resetModules(); // Force config reload
    const { visitPage } = await import("../../src/engines/visit_page/visit.js");

    const result = await visitPage(TEST_URL_HTTP);
    expect(result.content).toContain("Example Domain");

    const seenRequests = await mockedEndpoint.getSeenRequests();
    expect(seenRequests.length).toBe(1);
    expect(seenRequests[0].url).toBe(TEST_URL_HTTP);
  });

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
          process.env.USE_PROXY = "true";
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
  });


  it("should fail to launch when using SOCKS5 proxy with authentication (Chromium limitation)", () => {
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
          process.env.USE_PROXY = "true";
          const username = "user123";
          const password = "pass456";
          process.env.SOCKS5_PROXY = `socks5://${username}:${password}@127.0.0.1:${port}`;

          vi.resetModules(); // Force config reload
          const { visitPage } = await import("../../src/engines/visit_page/visit.js");

          // Chromium does not support SOCKS5 authentication. 
          // We verify that this limitation is correctly surfaced as a specific error.
          await expect(visitPage(TEST_URL_HTTP)).rejects.toThrow("Browser does not support socks5 proxy authentication");
          
          if (!authSuccess) {
            // This flag is irrelevant now as we expect it to fail before auth
          }
          if (!proxyConnected) {
             // proxy might not strictly connect if browser checks params first
          } 
          resolve(); 
        } catch (error) {
           // If it throws something else, we let it bubble up
           reject(error);
        }
      });
    });
  });

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

    process.env.USE_PROXY = "true";
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
  });

});
