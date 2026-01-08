/*
 * Attribution:
 * This module includes code adapted from mzxrai/mcp-webresearch (MIT License).
 * Original Author: mzxrai
 *
 * Modifications by rinaldowouterson:
 * - Added comprehensive SOCKS5/HTTP proxy support
 * - Removed Google-specific consent handling
 * - Refactored into modular architecture
 */
import { chromium, Browser, Page, LaunchOptions } from "playwright-chromium";
import TurndownService from "turndown";
import { McpError, ErrorCode } from "../../types/mcp-error.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { isValidBrowserUrl } from "../../utils/isValidUrl.js";
import { getConfig } from "../../config/index.js";
import { startProxyBridge, stopProxyBridge } from "../../utils/proxy_bridge.js";
import { VisitResult } from "../../types/VisitResult.js";

const SCREENSHOTS_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "mcp-screenshots-"),
);

let cleanupTimer: NodeJS.Timeout | null = null;
const IDLE_TIMEOUT = 5 * 60 * 1000;

const turndownService: TurndownService = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "_",
  strongDelimiter: "**",
  linkStyle: "inlined",
});

turndownService.addRule("removeScripts", {
  filter: ["script", "style", "noscript"],
  replacement: () => "",
});

turndownService.addRule("preserveLinks", {
  filter: "a",
  replacement: (content: string, node: any) => {
    const href = node.getAttribute("href");
    return href ? `[${content}](${href})` : content;
  },
});

turndownService.addRule("preserveImages", {
  filter: "img",
  replacement: (content: string, node: any) => {
    const alt = node.getAttribute("alt") || "";
    const src = node.getAttribute("src");
    return src ? `![${alt}](${src})` : "";
  },
});

let browser: Browser | undefined;

async function ensureBrowser(): Promise<Page> {
  if (!browser) {
    const launchOptions: LaunchOptions = createLaunchOptionsForPlayWright();

    const config = getConfig();
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
          console.error(
            "Failed to start bridge, falling back to direct:",
            error,
          );
        }
      }
    }

    browser = await chromium.launch(launchOptions);
    startTimeout();
  }
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("close", () => {
    console.debug("Page closed event detected");
    resetTimeout();
  });

  return page;
}

export function createLaunchOptionsForPlayWright() {
  const config = getConfig();
  const launchOptions: LaunchOptions = config.docker.isDocker
    ? {
        headless: true,
        executablePath: config.docker.chromiumPath,
      }
    : {
        headless: true,
      };

  console.debug(`visit: config.proxy.enabled: ${config.proxy.enabled}`);
  console.debug(`visit: config.proxy.isValid: ${config.proxy.isValid}`);
  // console.debug(`visit: config.proxy.url: ${config.proxy.url}`);

  if (config.proxy.enabled && config.proxy.isValid) {
    // console.debug(`Proxy configuration detected: ${config.proxy.url}`);

    const protocol = config.proxy.protocol;
    const host = config.proxy.host;
    const port = config.proxy.port;
    const username = config.proxy.username;
    const password = config.proxy.password;

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

async function takeScreenshotWithSizeLimit(page: Page): Promise<string> {
  const MAX_SIZE = 5 * 1024 * 1024;
  const MAX_DIMENSION = 1920;
  const MIN_DIMENSION = 800;

  await page.setViewportSize({ width: 1600, height: 900 });
  let screenshot = await page.screenshot({ type: "png", fullPage: false });
  let buffer = screenshot;
  let attempts = 0;
  const MAX_ATTEMPTS = 3;

  while (buffer.length > MAX_SIZE && attempts < MAX_ATTEMPTS) {
    const viewport = page.viewportSize();
    if (!viewport) continue;

    const scaleFactor = Math.pow(0.75, attempts + 1);
    let newWidth = Math.round(viewport.width * scaleFactor);
    let newHeight = Math.round(viewport.height * scaleFactor);

    newWidth = Math.max(MIN_DIMENSION, Math.min(MAX_DIMENSION, newWidth));
    newHeight = Math.max(MIN_DIMENSION, Math.min(MAX_DIMENSION, newHeight));

    await page.setViewportSize({ width: newWidth, height: newHeight });
    screenshot = await page.screenshot({ type: "png", fullPage: false });
    buffer = screenshot;
    attempts++;
  }

  if (buffer.length > MAX_SIZE) {
    await page.setViewportSize({ width: MIN_DIMENSION, height: MIN_DIMENSION });
    screenshot = await page.screenshot({ type: "png", fullPage: false });
    buffer = screenshot;

    if (buffer.length > MAX_SIZE) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Screenshot exceeds 5MB limit after optimization`,
      );
    }
  }

  return buffer.toString("base64");
}

async function saveScreenshot(
  screenshot: string,
  title: string,
): Promise<string> {
  const buffer = Buffer.from(screenshot, "base64");
  const MAX_SIZE = 5 * 1024 * 1024;

  if (buffer.length > MAX_SIZE) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Screenshot too large: ${Math.round(buffer.length / (1024 * 1024))}MB`,
    );
  }

  const timestamp = Date.now();
  const safeTitle = title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const filename = `${safeTitle}-${timestamp}.png`;
  const filepath = path.join(SCREENSHOTS_DIR, filename);

  await fs.promises.writeFile(filepath, buffer);
  return filepath;
}

async function safePageNavigation(page: Page, url: string): Promise<void> {
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

async function extractContentAsMarkdown(
  page: Page,
  selector?: string,
): Promise<string> {
  const html = await page.evaluate((sel: string | undefined) => {
    if (sel) {
      const element = document.querySelector(sel);
      return element ? element.outerHTML : "";
    }

    const contentSelectors = [
      "main",
      "article",
      '[role="main"]',
      "#content",
      ".content",
      ".main",
      ".post",
      ".article",
    ];

    for (const contentSelector of contentSelectors) {
      const element = document.querySelector(contentSelector);
      if (element) return element.outerHTML;
    }

    const body = document.body;
    const elementsToRemove = [
      "header",
      "footer",
      "nav",
      '[role="navigation"]',
      "aside",
      ".sidebar",
      '[role="complementary"]',
      ".nav",
      ".menu",
      ".header",
      ".footer",
      ".advertisement",
      ".ads",
      ".cookie-notice",
    ];

    elementsToRemove.forEach((sel) => {
      body.querySelectorAll(sel).forEach((el) => el.remove());
    });

    return body.outerHTML;
  }, selector);

  if (!html) return "";

  try {
    return turndownService
      .turndown(html)
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^- $/gm, "")
      .replace(/^\s+$/gm, "")
      .trim();
  } catch (error) {
    console.error("Markdown conversion failed:", error);
    return html;
  }
}

export async function visitPage(
  url: string,
  takeScreenshot = false,
): Promise<VisitResult> {
  if (!isValidBrowserUrl(url)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Invalid URL: Only http/https protocols supported`,
    );
  }

  const page = await ensureBrowser();

  try {
    await safePageNavigation(page, url);
    const title = await page.title();
    const content = await extractContentAsMarkdown(page);
    const result: VisitResult = {
      url,
      title,
      content,
      screenshot: undefined,
    };

    if (takeScreenshot) {
      const screenshot = await takeScreenshotWithSizeLimit(page);
      result.screenshot = await saveScreenshot(screenshot, title);
    }

    return result;
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Page visit failed: ${(error as Error).message}`,
    );
  } finally {
    await page.close();
    console.debug("We assume the page closed successfully for url: ", url);
  }
}

async function closeBrowser(): Promise<boolean> {
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

async function deleteScreenshots(deleteFolder = false): Promise<boolean> {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    console.debug("Screenshots directory does not exist, nothing to clean");
    return true;
  }

  const files = await fs.promises.readdir(SCREENSHOTS_DIR);

  if (files.length > 0) {
    await Promise.all(
      files.map((file) => fs.promises.unlink(path.join(SCREENSHOTS_DIR, file))),
    );
    console.debug(`Cleaned up ${files.length} screenshot(s)`);
  } else {
    console.debug("Screenshots directory is empty");
  }

  if (deleteFolder) {
    await fs.promises.rmdir(SCREENSHOTS_DIR);
    console.debug("Screenshots directory removed");
  }

  return true;
}

export async function cleanBrowserSession(): Promise<boolean> {
  const browserClosed = await closeBrowser();
  const screenshotsCleaned = await deleteScreenshots();
  if (!browserClosed || !screenshotsCleaned) {
    console.debug("Session cleanup incomplete");
    return false;
  }
  console.debug("Session cleanup completed successfully");
  return true;
}

function deleteTimeout() {
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }
}

function startTimeout() {
  cleanupTimer = setTimeout(async () => {
    console.debug("5-minute idle timeout reached, cleaning session...");
    await cleanBrowserSession();
  }, IDLE_TIMEOUT);
}

function resetTimeout() {
  deleteTimeout();
  startTimeout();
}
