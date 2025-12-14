import fs from "fs/promises";
import path from "path";
import { format } from "util";

const LOG_PATH = path.resolve(process.cwd(), "mcp-debug.log");
const WRITE_DEBUG_TERMINAL = process.env.WRITE_DEBUG_TERMINAL === "true";
const WRITE_DEBUG_FILE = process.env.WRITE_DEBUG_FILE === "true";
let stream: fs.FileHandle | null = null;

async function initStream(): Promise<void> {
  try {
    // Ensure the log file exists before proceeding
    await fs
      .access(LOG_PATH)
      .catch((error: any) =>
        error.code === "ENOENT"
          ? fs.writeFile(LOG_PATH, "")
          : Promise.reject(error)
      );

    stream = await fs.open(LOG_PATH, "a");
  } catch (error) {
    console.debug("Failed to initialize log stream:", error);
  }
}

export async function closeWritingStream(): Promise<void> {
  if (stream) {
    try {
      console.debug("Closing log stream and exiting...");
      await stream.close();
      stream = null;
    } catch (error) {
      console.debug("Failed to close log stream:", error);
    }
  }
}

function wrapConsole(method: "log" | "error" | "warn" | "debug"): void {
  const orig = console[method] as (...args: any[]) => void;
  console[method] = (...args: any[]) => {
    if (method === "debug" && WRITE_DEBUG_TERMINAL) {
      orig(...args);
    }

    if (method === "debug" && WRITE_DEBUG_FILE) {
      const timestamp = new Date().toISOString();
      const message = format(...args);

      // Non-blocking async write
      writeLogAsync(`[${timestamp}] ${message}\n`).catch((err) => {
        orig("Failed to write to log file:", err);
      });
    }
  };
}

async function writeLogAsync(message: string): Promise<void> {
  if (!stream) {
    await initStream();
  }

  if (stream) {
    try {
      await stream.write(message);
    } catch (error) {
      console.debug("Failed to write to log file:", error);
    }
  }
}

export async function captureConsoleDebug(): Promise<void> {
  if (WRITE_DEBUG_FILE) {
    await initStream();
  }

  const methods: Array<"debug"> = ["debug"];
  methods.forEach(wrapConsole);
}

export async function clearLogFile(): Promise<void> {
  try {
    await fs.unlink(LOG_PATH);
  } catch (error) {
    // File doesn't exist or other error - ignore
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.debug("Failed to clear log file:", error);
    }
  }
}

export const logger = {
  async debug(message: string, ...args: any[]): Promise<void> {
    if (WRITE_DEBUG_TERMINAL) {
      console.debug(message, ...args);
    }
    if (WRITE_DEBUG_FILE) {
      const formatted = format(message, ...args);
      await writeLogAsync(
        `[${new Date().toISOString()}] DEBUG: ${formatted}\n`
      );
    }
  },
};
