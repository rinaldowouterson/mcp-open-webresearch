#!/usr/bin/env node
import { captureConsoleDebug, closeWritingStream } from "./utils/logger.js";

import {
  serverInitializer,
  initEngineRegistry,
} from "./infrastructure/bootstrap/toolRegistry.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { setConfig } from "./config/index.js";
import { cleanBrowserSession } from "./infrastructure/visit_page/visit.js";
import { configureLogger } from "./utils/logger.js";
import { mcpServer } from "./infrastructure/bootstrap/instance.js";
import { createApp } from "./infrastructure/bootstrap/app.js";
import { parseCliArgs } from "./utils/cli.js";

export { mcpServer };
export { createApp };

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
