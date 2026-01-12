import { describe, it, expect, vi, afterEach } from "vitest";
import { createApp } from "../../../src/infrastructure/bootstrap/app.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AppConfig } from "../../../src/types/index.js";
import express from "express";
import { AddressInfo } from "net";
import http from "http";

describe("MCP App Combined Security Verification", () => {
  const allowedHost = "allowed.com";
  const disallowedHost = "malicious.com";

  let server: any;

  afterEach(() => {
    if (server) {
      server.close();
      server = undefined;
    }
    vi.restoreAllMocks();
  });

  const mockServer = {
    connect: vi.fn().mockResolvedValue(undefined),
  } as unknown as McpServer;

  const createTestConfig = (protectionEnabled: boolean): AppConfig => ({
    port: 0,
    publicUrl: "http://localhost:0",
    defaultSearchEngines: [],
    proxy: { enabled: false } as any,
    enableCors: false,
    corsOrigin: "*",
    ssl: { ignoreTlsErrors: false },
    docker: { isDocker: false, chromiumPath: undefined },
    browser: {
      idleTimeout: 30000,
      concurrency: 4,
      screenshotMaxSize: 500 * 1024,
    },
    logging: {
      level: "debug",
      path: "test.log",
      writeToTerminal: false,
      writeToFile: false,
    },
    llm: { samplingAllowed: false } as any,
    skipCooldown: false,
    deepSearch: {} as any,
    security: {
      enableDnsRebindingProtection: protectionEnabled,
      allowedHosts: [allowedHost],
    },
  });

  const makeRequest = (port: number, hostHeader: string): Promise<number> => {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "127.0.0.1",
        port: port,
        path: "/mcp",
        method: "POST",
        headers: {
          Host: hostHeader,
          "Content-Type": "application/json",
        },
      };

      const req = http.request(options, (res) => {
        resolve(res.statusCode || 0);
      });

      req.on("error", reject);
      // Send an initialize-like request body to trigger transport creation
      req.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0.0" },
          },
        }),
      );
      req.end();
    });
  };

  it("should fulfill the CONTRACT and provide BEHAVIORAL protection", async () => {
    // We verify the CONTRACT by proving that the specific 'allowedHost' from config is the only one accepted
    const config = createTestConfig(true);
    const app = createApp(mockServer, config);

    const { port, s } = await new Promise<{ port: number; s: any }>(
      (resolve) => {
        const server = app.listen(0, "127.0.0.1", () => {
          const addr = server.address() as AddressInfo;
          resolve({ port: addr.port, s: server });
        });
      },
    );
    server = s;

    // 1. Verify it blocks disallowed
    expect(await makeRequest(port, disallowedHost)).toBe(403);

    // 2. Verify it allows allowed
    expect(await makeRequest(port, allowedHost)).not.toBe(403);
  });

  it("should respect custom allowedHosts from configuration", async () => {
    const customHost = "my-custom-host.net";
    const config = createTestConfig(true);
    config.security.allowedHosts = [customHost];

    const app = createApp(mockServer, config);

    const { port, s } = await new Promise<{ port: number; s: any }>(
      (resolve) => {
        const server = app.listen(0, "127.0.0.1", () => {
          const addr = server.address() as AddressInfo;
          resolve({ port: addr.port, s: server });
        });
      },
    );
    server = s;

    // Verify it blocks the previous 'allowedHost' because it's no longer in the list
    expect(await makeRequest(port, allowedHost)).toBe(403);

    // Verify it allows the new custom host
    expect(await makeRequest(port, customHost)).not.toBe(403);
  });

  it("should allow any host when protection is disabled (Behavior Test)", async () => {
    const config = createTestConfig(false);
    const app = createApp(mockServer, config);

    const { port, s } = await new Promise<{ port: number; s: any }>(
      (resolve) => {
        const server = app.listen(0, "127.0.0.1", () => {
          const addr = server.address() as AddressInfo;
          resolve({ port: addr.port, s: server });
        });
      },
    );
    server = s;

    expect(await makeRequest(port, disallowedHost)).not.toBe(403);
  });
});
