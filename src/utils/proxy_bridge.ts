import { Server } from "proxy-chain";

/**
 * Stores the active proxy server instance.
 * We keep track of it to ensure we can shut it down properly.
 */
let bridgeServer: Server | null = null;

/**
 * Starts a local HTTP proxy bridge that forwards traffic to an upstream proxy.
 * This is used to work around Chromium's limitation with SOCKS5 authentication.
 *
 * @param upstreamProxyUrl - The full upstream proxy URL (e.g. "socks5://user:pass@host:port")
 * @returns The URL of the local bridge server (e.g. "http://127.0.0.1:12345")
 */
export async function startProxyBridge(upstreamProxyUrl: string): Promise<string> {
  // If a bridge is already running, close it first to avoid leaks
  if (bridgeServer) {
    await stopProxyBridge();
  }

  try {
    console.debug(`Starting proxy bridge for upstream: ${upstreamProxyUrl}`);

    bridgeServer = new Server({
      // 0 lets the OS assign a random available port
      port: 0,
      // We turned off verbose logging to keep stdout clean, unless debugging is needed
      verbose: false,
      prepareRequestFunction: () => {
        return {
          upstreamProxyUrl,
        };
      },
    });

    await bridgeServer.listen();
    
    // We use 127.0.0.1 explicitly to avoid issues with some environments resolving 'localhost'
    const port = bridgeServer.port;
    const localBridgeUrl = `http://127.0.0.1:${port}`;
    
    console.debug(`Proxy bridge started at: ${localBridgeUrl}`);
    return localBridgeUrl;
  } catch (error) {
    console.error("Failed to start proxy bridge:", error);
    throw new Error(`Failed to start proxy bridge: ${(error as Error).message}`);
  }
}

/**
 * Stops the local proxy bridge if it is running.
 * Should be called when the browser session ends.
 */
export async function stopProxyBridge(): Promise<void> {
  if (bridgeServer) {
    try {
      await bridgeServer.close(true); // true = force close connections
      console.debug("Proxy bridge stopped successfully");
    } catch (error) {
      console.warn("Error stopping proxy bridge:", error);
    } finally {
      bridgeServer = null;
    }
  }
}
