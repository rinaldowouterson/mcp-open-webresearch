import { Page } from "playwright-chromium";
import TurndownService from "turndown";
import { McpError, ErrorCode } from "../../types/mcp-error.js";
import * as fs from "fs";
import * as path from "path";
import { getConfig } from "../../config/index.js";
import { normalizeUrlForDedup } from "../../utils/url.js";

// Initialize Turndown Service (module-level singleton)
const turndownService = new TurndownService({
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

/**
 * Extracts page content and converts it to Markdown.
 */
export async function extractContentAsMarkdown(
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

/**
 * Extracts visible plain text from the body.
 */
export async function extractVisibleText(page: Page): Promise<string> {
  return await page.evaluate(() => document.body.innerText);
}

/**
 * Takes an optimized screenshot.
 * @returns base64 encoded string
 */
export async function takeScreenshotWithSizeLimit(page: Page): Promise<string> {
  const maxSize = getMaxSize();
  const MAX_DIMENSION = 1920;
  const MIN_DIMENSION = 800;

  await page.setViewportSize({ width: 1600, height: 900 });
  let screenshot = await page.screenshot({ type: "png", fullPage: false });
  let buffer = screenshot;

  const MAX_ATTEMPTS = 10;
  const SCALING_FACTOR = 0.9;

  // Iteratively reduce viewport size until screenshot is under limit (max 10 attempts)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (buffer.length <= maxSize) {
      break; // Screenshot is already within limits
    }

    const viewport = page.viewportSize();
    if (!viewport) continue;

    const scale = Math.pow(SCALING_FACTOR, attempt + 1);
    let newWidth = Math.round(viewport.width * scale);
    let newHeight = Math.round(viewport.height * scale);

    newWidth = Math.max(MIN_DIMENSION, Math.min(MAX_DIMENSION, newWidth));
    newHeight = Math.max(MIN_DIMENSION, Math.min(MAX_DIMENSION, newHeight));

    console.debug(
      `[ContentScraper] Screenshot too large: ${(buffer.length / 1024 / 1024).toFixed(2)}MB. Scaling viewport to ${newWidth}x${newHeight} (Attempt ${attempt + 1}/${MAX_ATTEMPTS})...`,
    );

    await page.setViewportSize({ width: newWidth, height: newHeight });
    screenshot = await page.screenshot({ type: "png", fullPage: false });
    buffer = screenshot;
  }

  if (buffer.length > maxSize) {
    console.debug(
      `[ContentScraper] Still too large: ${(buffer.length / 1024 / 1024).toFixed(2)}MB. Forcing minimum size ${MIN_DIMENSION}x${MIN_DIMENSION}...`,
    );
    await page.setViewportSize({ width: MIN_DIMENSION, height: MIN_DIMENSION });
    screenshot = await page.screenshot({ type: "png", fullPage: false });
    buffer = screenshot;

    if (buffer.length > maxSize) {
      throw new McpError(
        ErrorCode.InternalError,
        `Screenshot exceeds ${(maxSize / 1024 / 1024).toFixed(2)}MB limit after optimization`,
      );
    }
  }

  return buffer.toString("base64");
}

/**
 * Screenshot logic and content validation.
 */

/**
 * Maximum size allowed for a screenshot file (from config).
 */
const getMaxSize = () => getConfig().browser.screenshotMaxSize;

/**
 * Page content validation result.
 */
export async function saveScreenshot(
  screenshot: string,
  title: string,
  screenshotsDir: string,
): Promise<string | undefined> {
  const buffer = Buffer.from(screenshot, "base64");

  const timestamp = Date.now();
  const safeTitle = title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const filename = `${safeTitle}-${timestamp}.png`;
  const filepath = path.join(screenshotsDir, filename);

  await fs.promises.writeFile(filepath, buffer);

  // Check if file size is within limits
  const stats = await fs.promises.stat(filepath);
  if (stats.size > getMaxSize()) {
    console.debug(
      `[ContentScraper] Screenshot too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB (limit: ${(getMaxSize() / 1024 / 1024).toFixed(2)}MB)`,
    );
    await fs.promises.unlink(filepath);
    return undefined;
  }

  return filepath;
}
