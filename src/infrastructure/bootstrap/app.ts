/**
 * Express Application Factory
 * Creates and configures the Express application with MCP transport.
 * Extracted for testability to allow verification of the server "contract".
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import cors from "cors";
import { getBuffer } from "../cache/ephemeralBuffer.js";
import { AppConfig } from "../../types/index.js";

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
