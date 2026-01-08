import fs from "fs/promises";
import path from "path";
import { format } from "util";

const LOG_PATH_DEFAULT = "mcp-debug.log";
// We default global logger config to strict safety: no output until configured.
// This ensures that unit tests or scripts don't accidentally write logs unless they mean to.

interface LoggerConfig {
  writeToTerminal: boolean;
  writeToFile: boolean;
  path: string;
}

const loggerConfig: LoggerConfig = {
  writeToTerminal: false,
  writeToFile: false,
  path: LOG_PATH_DEFAULT,
};

export function configureLogger(options: Partial<LoggerConfig>) {
  if (options.writeToTerminal !== undefined) {
    loggerConfig.writeToTerminal = options.writeToTerminal;
  }
  if (options.writeToFile !== undefined) {
    loggerConfig.writeToFile = options.writeToFile;
  }
  if (options.path !== undefined) {
    loggerConfig.path = options.path;
  }
}

let stream: fs.FileHandle | null = null;

async function initStream(): Promise<void> {
  try {
    // Ensure the log file exists before proceeding
    // We resolve the path relative to cwd if it's not absolute, or just use it as is if it's absolute
    const logPath = path.isAbsolute(loggerConfig.path)
      ? loggerConfig.path
      : path.resolve(process.cwd(), loggerConfig.path);

    await fs
      .access(logPath)
      .catch((error: any) =>
        error.code === "ENOENT"
          ? fs.writeFile(logPath, "")
          : Promise.reject(error),
      );

    stream = await fs.open(logPath, "a");
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
    if (method === "debug" && loggerConfig.writeToTerminal) {
      orig(...args);
    }

    if (method === "debug" && loggerConfig.writeToFile) {
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
  if (loggerConfig.writeToFile) {
    await initStream();
  }

  const methods: Array<"debug"> = ["debug"];
  methods.forEach(wrapConsole);
}

export async function clearLogFile(): Promise<void> {
  try {
    await fs.unlink(loggerConfig.path);
  } catch (error) {
    // File doesn't exist or other error - ignore
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.debug("Failed to clear log file:", error);
    }
  }
}

export const logger = {
  async debug(message: string, ...args: any[]): Promise<void> {
    if (loggerConfig.writeToTerminal) {
      console.debug(message, ...args);
    }
    if (loggerConfig.writeToFile) {
      const formatted = format(message, ...args);
      await writeLogAsync(
        `[${new Date().toISOString()}] DEBUG: ${formatted}\n`,
      );
    }
  },
};
