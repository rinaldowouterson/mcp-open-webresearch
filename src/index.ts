#!/usr/bin/env node
import "dotenv/config"; // Load environment variables from .env file
import { captureConsoleDebug, closeWritingStream } from "./utils/logger.js";
captureConsoleDebug();
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { serverInitializer } from "./server/initializer.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import cors from "cors";
import { loadConfig } from "./config/loader.js";

import { cleanBrowserSession } from "./engines/visit_page/visit.js";

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
    "Received SIGHUP (terminal session ending), cleaning session..."
  );
  await cleanBrowserSession();
  await closeWritingStream();
  process.exit(0);
});

async function main() {
  const app = express();

  const mcpServer = new McpServer({
    name: "web-search",
    version: "1.1",
  });

  serverInitializer(mcpServer);

  app.use(express.json());

  if (loadConfig().enableCors) {
    app.use(
      cors({
        origin: loadConfig().corsOrigin || "*",
        methods: ["GET", "POST", "DELETE"],
      })
    );
    app.options("*", cors());
  }

  const transports = {
    streamable: {} as Record<string, StreamableHTTPServerTransport>,
    sse: {} as Record<string, SSEServerTransport>,
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
        // DNS rebinding protection is disabled by default for backwards compatibility. If you are running this server
        // locally, make sure to set:
        // enableDnsRebindingProtection: true,
        // allowedHosts: ['127.0.0.1'],
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports.streamable[transport.sessionId];
        }
      };

      await mcpServer.connect(transport);
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
    res: express.Response
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

  // Legacy SSE endpoint for older clients
  app.get("/sse", async (req, res) => {
    const transport = new SSEServerTransport("/messages", res);
    transports.sse[transport.sessionId] = transport;

    res.on("close", () => {
      delete transports.sse[transport.sessionId];
    });

    await mcpServer.connect(transport);
  });

  // Legacy message endpoint for older clients
  app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports.sse[sessionId];
    if (transport) {
      await transport.handlePostMessage(req, res, req.body);
    } else {
      res.status(400).send("No transport found for sessionId");
    }
  });

  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
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

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
