#!/usr/bin/env node
import { captureConsoleDebug, closeWritingStream } from "./utils/logger.js";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { serverInitializer, initEngineRegistry } from "./server/initializer.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import cors from "cors";
import { setConfig } from "./config/index.js";
import { cleanBrowserSession } from "./engines/visit_page/visit.js";
import { configureLogger } from "./utils/logger.js";
import { mcpServer } from "./server/instance.js";
import { getBuffer } from "./server/helpers/ephemeralBufferCache.js";

import { AppConfig } from "./types/index.js";

export { mcpServer };

process.on("SIGTERM", async () => {
  console.debug("Received SIGTERM (VSCode closing), cleaning session...");
  await cleanBrowserSession();
  await closeWritingStream();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.debug("Received SIGINT (Ctrl+C), cleaning session...");
  await cleanBrowserSession();
  await closeWritingStream();
  process.exit(0);
});

process.on("SIGHUP", async () => {
  console.debug(
    "Received SIGHUP (terminal session ending), cleaning session...",
  );
  await cleanBrowserSession();
  await closeWritingStream();
  process.exit(0);
});

/**
 * Creates and configures the Express application with MCP transport.
 * Extracted for testability to allow verification of the server "contract".
 */
export function createApp(server: McpServer, appConfig: AppConfig) {
  const app = express();

  app.use(express.json());

  if (appConfig.enableCors) {
    app.use(
      cors({
        origin: appConfig.corsOrigin || "*",
        methods: ["GET", "POST", "DELETE"],
      }),
    );
    app.options("*", cors());
  }

  const transports = {
    streamable: {} as Record<string, StreamableHTTPServerTransport>,
  };

  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.streamable[sessionId]) {
      transport = transports.streamable[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          transports.streamable[sessionId] = transport;
        },
        enableDnsRebindingProtection:
          appConfig.security.enableDnsRebindingProtection,
        allowedHosts: appConfig.security.allowedHosts,
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports.streamable[transport.sessionId];
        }
      };

      await server.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  });

  const handleSessionRequest = async (
    req: express.Request,
    res: express.Response,
  ) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports.streamable[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    const transport = transports.streamable[sessionId];
    await transport.handleRequest(req, res);
  };

  app.get("/mcp", handleSessionRequest);

  app.delete("/mcp", handleSessionRequest);

  app.get("/download/:id", (req, res) => {
    const id = req.params.id;
    const buffer = getBuffer(id);

    if (!buffer) {
      res.status(404).send("Download expired or not found");
      return;
    }

    res.setHeader("Content-Type", "text/markdown");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="deep-search-result-${id}.md"`,
    );
    res.send(buffer);
  });

  return app;
}

import { parseCliArgs } from "./utils/cli.js";

async function main() {
  // 1. Phase 1 (Data): Parse CLI args into a simple overrides object.
  // No logging should happen before this point.
  const overrides = parseCliArgs();

  // 2. Phase 2 (Consolidation): Call setConfig.
  // This is the single point where priority (CLI > Env > Default) is resolved.
  const appConfig = setConfig(mcpServer, overrides);

  // 3. Phase 3 (Initialization): Configure logger ONCE.
  // Now we have the final logging configuration.
  configureLogger(appConfig.logging);

  await captureConsoleDebug();

  // 4. Phase 4 (Execution): Initialize registry and server.
  // Initialize engine registry types/searchers
  await initEngineRegistry();

  serverInitializer(mcpServer);

  const app = createApp(mcpServer, appConfig);

  const PORT = appConfig.port;
  const transport = new StdioServerTransport();

  await mcpServer
    .connect(transport)
    .then(() => {
      console.debug("STDIO Transport enabled");
    })
    .catch(console.error);

  app.listen(PORT, "0.0.0.0", () => {
    console.debug(`Server is running on port ${PORT}`);
  });
}

main().catch(async (error) => {
  // Ensure we attempt to log to the configured destination if possible,
  // otherwise fallback to stderr
  console.error("Fatal error:", error);
  await cleanBrowserSession().catch(() => {});
  await closeWritingStream().catch(() => {});
  process.exit(1);
});
