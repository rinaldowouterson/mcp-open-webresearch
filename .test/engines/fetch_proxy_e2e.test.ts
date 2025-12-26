import * as fs from "fs";
import * as path from "path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as http from "http";
import * as net from "net";
import { URL } from "url";
import * as mockttp from "mockttp";
import socks5 from "simple-socks";
import { fetchBingPage } from "../../src/engines/fetch/index.js";
import axios from "axios";

// Helper to wait for the socks server to be ready
const createSocksServer = (port: number, options: any = {}): Promise<any> => {
  return new Promise((resolve) => {
    const server = socks5.createServer(options);
    server.listen(port, "localhost", () => {
      resolve(server);
    });
  });
};

const createHttpProxy = (port: number, onConnect: (url: string, headers: http.IncomingHttpHeaders) => void): Promise<http.Server> => {
    const proxy = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('okay');
    });

    proxy.on('connect', (req, clientSocket, head) => {
        if (req.url) {
            onConnect(req.url, req.headers);
            const [hostname, portStr] = req.url.split(':');
            const port = parseInt(portStr, 10) || 443;
            
            const serverSocket = net.connect(port, hostname, () => {
                clientSocket.write('HTTP/1.1 200 Connection Established\r\n' +
                                'Proxy-agent: Node.js-Proxy\r\n' +
                                '\r\n');
                serverSocket.write(head);
                serverSocket.pipe(clientSocket);
                clientSocket.pipe(serverSocket);
            });
            serverSocket.on('error', (err) => {
                console.error(`Local Proxy Upstream Error (${hostname}:${port}):`, err);
                clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
            });

            serverSocket.on('error', () => {
                clientSocket.end();
            });
            clientSocket.on('error', () => {
                serverSocket.end();
            });
        }
    });

    return new Promise<http.Server>((resolve) => {
        proxy.listen(port, '127.0.0.1', () => resolve(proxy));
    });
};

describe("Fetch Proxy E2E Tests", () => {
    // These tests involve creating local proxies.
    // In Docker, we must ensure we don't conflict with system proxies.
    // We achieve this by explicitly unsetting colliding env vars.

  let proxyServer: mockttp.Mockttp | undefined;
  let customHttpProxy: http.Server | undefined;
  let socksServer: any;

  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    // CRITICAL: Unset system proxy vars so tests use our local test proxies
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    delete process.env.SOCKS5_PROXY;

    vi.resetModules();
    // clear axios defaults
    axios.defaults.httpAgent = undefined;
    axios.defaults.httpsAgent = undefined;
    
    // Allow self-signed certs for our local test proxy
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
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
    // We use mockttp for a smarter proxy that can also mock the upstream response
    // ensuring we don't need real internet.
    // We configure it with the TRUSTED test CA so Node/Axios accepts the connection.
    
    // Determine paths (support both Docker and local fallback)
    const keyPath = process.env.TEST_CA_KEY_PATH || path.join(process.cwd(), 'certs/test/key/test-ca.key');
    const certPath = process.env.TEST_CA_CERT_PATH || path.join(process.cwd(), 'certs/test/test-ca.crt');
    
    // Read the certs
    const key = fs.readFileSync(keyPath, 'utf8');
    const cert = fs.readFileSync(certPath, 'utf8');

    proxyServer = mockttp.getLocal({
        https: {
            key,
            cert,
        }
    });
    await proxyServer.start();
    
    // Mock the upstream response for bing.com
    const mockEndpoint = await proxyServer.forAnyRequest().forHostname("www.bing.com").thenReply(200, "Mock Bing Reached");
    
    // 127.0.0.1 is safer than localhost in some containers
    const proxyUrl = proxyServer.url.replace("localhost", "127.0.0.1");

    process.env.ENABLE_PROXY = "true";
    process.env.HTTP_PROXY = proxyUrl;
    // Ensure no fallback to system proxy
    delete process.env.HTTPS_PROXY;

    const { fetchBingPage: freshFetchBing } = await import(
      "../../src/engines/fetch/index.js"
    );

    // Manual Override: Re-create the agent with rejectUnauthorized: false
    // relying on the previously imported HttpsProxyAgent


    // This will try to connect to bing through our proxy.
    // It should now SUCCEED because the proxy is using a trusted CA.
    const result = await freshFetchBing("test query", 0);
    expect(result).toBe("Mock Bing Reached");
    
    // Check requests seen by our specific mock rule
    const seenRequests = await mockEndpoint.getSeenRequests();
    expect(seenRequests.some((r: any) => r.url.includes("bing.com"))).toBe(true);
  });

  it("should authenticate with HTTP proxy", async () => {
    const authHeaders: string[] = [];
    
    // We can't easily use mockttp for verifying specific auth headers on CONNECT 
    // without more complex setup, so we stick to the custom implementation 
    // but ensure it listens on 127.0.0.1 and we handle the upstream connection.
    // For specific auth testing, we just want to know headers were sent.
    
    customHttpProxy = await createHttpProxy(0, (url, headers) => {
        if (headers['proxy-authorization']) {
            authHeaders.push(headers['proxy-authorization']);
        }
    });

    const username = "user123";
    const password = "password456";
    const address = customHttpProxy.address() as net.AddressInfo;
    const proxyUrl = `http://${username}:${password}@127.0.0.1:${address.port}`;

    process.env.ENABLE_PROXY = "true";
    process.env.HTTP_PROXY = proxyUrl;
    delete process.env.HTTPS_PROXY;

    const { fetchBingPage: freshFetchBing } = await import(
      "../../src/engines/fetch/index.js"
    );
    
    // Expected to fail upstream since our custom proxy is basic, 
    // but we only verify headers here.
    try {
        await freshFetchBing("test query", 0);
    } catch (e) { /* expected */ }
    
    const expectedAuth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
    expect(authHeaders).toContain(expectedAuth);
  });

  it("should route traffic directly when proxy is disabled", async () => {
    process.env.ENABLE_PROXY = "false";
    
    const { fetchBingPage: freshFetchBing } = await import(
        "../../src/engines/fetch/index.js"
    );
    
    // Should work without throwing connectivity errors (assuming internet access)
    // and definitely should NOT try to use our (non-existent) proxy
    const result = await freshFetchBing("test query", 0);
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
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

    // Re-import to load config and set agents
    const { fetchBingPage: freshFetchBing } = await import(
      "../../src/engines/fetch/index.js"
    );

    // We expect the request to fail (or succeed if internet is available), 
    // but CRITICALLY we want to know if it tried to go through the proxy.
    try {
        await freshFetchBing("test query", 0);
    } catch (e: any) {
        // If it fails with network error that looks like proxy issue, that's fine.
    }
    
    // STRICT VERIFICATION: The proxy MUST have received a connection attempt.
    expect(proxyConnected).toBe(true);
  });

  it("should authenticate with SOCKS5 proxy", async () => {
    const socksPort = 0;
    let authAttempts = 0;
    let success = false;

    socksServer = await createSocksServer(socksPort, {
        authenticate: (username: string, password: string, socket: any, callback: (err?: Error) => void) => {
            authAttempts++;
            if (username === "user123" && password === "pass456") {
                success = true;
                callback(); // Success
            } else {
                callback(new Error("Authentication failed"));
            }
        }
    });
    
    const address = socksServer.address();
    const port = address.port;

    const username = "user123";
    const password = "pass456";
    process.env.ENABLE_PROXY = "true";
    process.env.SOCKS5_PROXY = `socks5://${username}:${password}@localhost:${port}`;

    const { fetchBingPage: freshFetchBing } = await import(
      "../../src/engines/fetch/index.js"
    );

    try {
        await freshFetchBing("test query", 0);
    } catch(e) { 
        // Expected to fail on actual request but auth should have happened
    }

    expect(authAttempts).toBeGreaterThan(0);
    expect(success).toBe(true);
  });
});
