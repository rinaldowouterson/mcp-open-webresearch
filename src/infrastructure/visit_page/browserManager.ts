import {
  chromium,
  Browser,
  Page,
  BrowserContext,
  LaunchOptions,
} from "playwright-chromium";
import { getConfig } from "../../config/index.js";
import { startProxyBridge, stopProxyBridge } from "../../utils/proxy_bridge.js";

// Singleton browser instance (module-level state)
let browser: Browser | undefined;
let cleanupTimer: NodeJS.Timeout | null = null;

/**
 * Time in milliseconds to keep browser open after last activity.
 */
const getIdleTimeout = () => getConfig().browser.idleTimeout;

/**
 * A page session containing the page and its parent context.
 * Caller is responsible for closing the context when done.
 */
export interface PageSession {
  page: Page;
  context: BrowserContext;
}

/**
 * Creates launch options based on current config.
 * Handles Docker and Proxy settings.
 */
export function createLaunchOptions(): LaunchOptions {
  const config = getConfig();
  const launchOptions: LaunchOptions = config.docker.isDocker
    ? {
        headless: true,
        executablePath: config.docker.chromiumPath,
      }
    : {
        headless: true,
      };

  console.debug(
    `BrowserManager: config.proxy.enabled: ${config.proxy.enabled}`,
  );
  console.debug(
    `BrowserManager: config.proxy.isValid: ${config.proxy.isValid}`,
  );

  if (config.proxy.enabled && config.proxy.isValid) {
    const { protocol, host, port, username, password } = config.proxy;

    if (host && port && protocol) {
      launchOptions.proxy = {
        server: `${protocol}://${host}:${port}`,
        username: username !== null ? username : undefined,
        password: password !== null ? password : undefined,
      };
      console.debug(`Using proxy: ${protocol}://${host}:${port}`);
    } else {
      console.debug("Proxy configuration incomplete - host or port missing");
    }
  }
  return launchOptions;
}

/**
 * Initializes the browser if needed and returns a new page session.
 * The caller MUST close the context when done to prevent memory leaks.
 */
export async function getPage(): Promise<PageSession> {
  if (!browser) {
    await initializeBrowser();
  }

  // Refresh timeout on activity
  resetTimeout();

  const context = await browser!.newContext();
  const page = await context.newPage();

  return { page, context };
}

/**
 * Orchestrates safe navigation and content validation.
 * Throws if bot protection, suspicious title, or insufficient content detected.
 */
export async function safePageNavigation(
  page: Page,
  url: string,
): Promise<void> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });

    const validation = await page.evaluate(() => {
      const botProtectionExists = [
        "#challenge-running",
        "#cf-challenge-running",
        "#px-captcha",
        "#ddos-protection",
        "#waf-challenge-html",
      ].some((selector) => document.querySelector(selector));

      const suspiciousTitle = [
        "security check",
        "ddos protection",
        "please wait",
        "just a moment",
        "attention required",
      ].some((phrase) => document.title.toLowerCase().includes(phrase));

      const bodyText = document.body.innerText || "";
      const words = bodyText.trim().split(/\s+/).length;

      return {
        wordCount: words,
        botProtection: botProtectionExists,
        suspiciousTitle,
        title: document.title,
      };
    });

    if (validation.botProtection) throw new Error("Bot protection detected");
    if (validation.suspiciousTitle)
      throw new Error(`Suspicious title: "${validation.title}"`);
    if (validation.wordCount < 10) throw new Error("Insufficient content");
  } catch (error) {
    throw new Error(`Navigation failed: ${(error as Error).message}`);
  }
}

/**
 * Internal: Initializes the browser instance.
 */
async function initializeBrowser(): Promise<void> {
  const launchOptions = createLaunchOptions();
  const config = getConfig();

  // Special handling for SOCKS5 with auth (needs bridge)
  if (
    config.proxy.enabled &&
    config.proxy.isValid &&
    config.proxy.protocol === "socks5" &&
    (config.proxy.username || config.proxy.password)
  ) {
    const { protocol, host, port, username, password } = config.proxy;
    if (host && port) {
      const auth =
        username || password
          ? `${encodeURIComponent(username || "")}:${encodeURIComponent(
              password || "",
            )}@`
          : "";
      const upstreamUrl = `${protocol}://${auth}${host}:${port}`;
      try {
        const bridgeUrl = await startProxyBridge(upstreamUrl);
        launchOptions.proxy = {
          server: bridgeUrl,
        };
        console.debug(`SOCKS5 Bridge activated`);
      } catch (error) {
        console.error("Failed to start bridge, falling back to direct:", error);
      }
    }
  }

  browser = await chromium.launch(launchOptions);
  startTimeout();
}

/**
 * Closes the browser and cleans up resources.
 */
export async function closeBrowser(): Promise<boolean> {
  deleteTimeout();

  if (browser) {
    try {
      await browser.close();
      browser = undefined;
      await stopProxyBridge();
      console.debug("Browser closed successfully");
      return true;
    } catch (error) {
      console.debug("Failed to close browser:", (error as Error).message);
      // Try to stop bridge even if browser close fails
      await stopProxyBridge();
      return false;
    }
  } else {
    console.debug("No browser instance to close");
    return true;
  }
}

// --- Timeout Management ---

function startTimeout() {
  cleanupTimer = setTimeout(async () => {
    console.debug(
      `${getIdleTimeout() / 60000}-minute idle timeout reached, closing browser...`,
    );
    await closeBrowser();
    // Note: We don't clean screenshots here, that's up to the coordinator
  }, getIdleTimeout());
}

function deleteTimeout() {
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }
}

function resetTimeout() {
  deleteTimeout();
  startTimeout();
}
