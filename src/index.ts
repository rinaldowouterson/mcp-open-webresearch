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
import { program } from "commander";
import { loadConfig, setLLMConfig } from "./config/index.js";
import { type ConfigOverrides } from "./types/ConfigOverrides.js";
import { cleanBrowserSession } from "./engines/visit_page/visit.js";
import { configureLogger } from "./utils/logger.js";

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

async function main() {
  program
    .option("-p, --port <number>", "Port to listen on")
    .option("-d, --debug", "Enable debug logging to stdout")
    .option("--debug-file", "Enable debug logging to file")
    .option("--cors", "Enable CORS")
    .option("--proxy <url>", "Proxy URL")
    .option(
      "--engines <items>",
      "Comma-separated list of search engines",
      (value) => value.split(","),
    )
    .option("--sampling", "Enable sampling for search results (default)")
    .option("--no-sampling", "Disable sampling for search results")
    .parse();

  const options = program.opts();

  const overrides: ConfigOverrides = {
    port: options.port ? parseInt(options.port, 10) : undefined,
    debug: options.debug,
    debugFile: options.debugFile,
    cors: options.cors,
    proxyUrl: options.proxy,
    engines: options.engines,
    sampling: options.sampling,
  };

  configureLogger({
    writeToTerminal: overrides.debug,
    writeToFile: overrides.debugFile,
  });

  await captureConsoleDebug();

  const app = express();

  const mcpServer = new McpServer({
    name: "open-webresearch",
    version: "25.12.28",
  });

  // Initialize engine registry before registering tools
  await initEngineRegistry();

  serverInitializer(mcpServer);

  // Initialize LLM config with server capabilities (one-time setup)
  setLLMConfig(mcpServer);

  // Now loadConfig() can access cached LLM config
  const appConfig = loadConfig(overrides);

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

  const PORT =
    overrides.port ||
    (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);
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
