/*
 * Attribution:
 * This module includes code adapted from mzxrai/mcp-webresearch (MIT License).
 * Original Author: mzxrai
 *
 * Modifications by rinaldowouterson:
 * - Added comprehensive SOCKS5/HTTP proxy support
 * - Removed Google-specific consent handling
 * - Refactored into modular architecture (Functional Style)
 */
import { McpError, ErrorCode } from "../../types/mcp-error.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { isValidBrowserUrl } from "../../utils/isValidUrl.js";
import { VisitResult } from "../../types/VisitResult.js";
import type { BrowserContext } from "playwright-chromium";

import {
  getPage,
  closeBrowser,
  createLaunchOptions,
  safePageNavigation,
} from "./browserManager.js";
import {
  extractContentAsMarkdown,
  extractVisibleText,
  takeScreenshotWithSizeLimit,
  saveScreenshot,
} from "./contentScraper.js";

const SCREENSHOTS_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "mcp-screenshots-"),
);

/**
 * Visits a webpage, extracts content, and optionally takes a screenshot.
 * Coordinates BrowserManager and ContentScraper.
 */
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

  let context: BrowserContext | undefined;
  try {
    const session = await getPage();
    context = session.context;
    const page = session.page;

    await safePageNavigation(page, url);

    const title = await page.title();
    const content = await extractContentAsMarkdown(page);
    const textContent = await extractVisibleText(page);

    const result: VisitResult = {
      url,
      title,
      content,
      textContent,
      screenshot: undefined,
    };

    if (takeScreenshot) {
      const screenshot = await takeScreenshotWithSizeLimit(page);
      result.screenshot = await saveScreenshot(
        screenshot,
        title,
        SCREENSHOTS_DIR,
      );
    }

    return result;
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Page visit failed: ${(error as Error).message}`,
    );
  } finally {
    if (context) {
      await context.close();
      console.debug("Context closed successfully for url:", url);
    }
  }
}

/**
 * Cleans up the entire browser session and screenshots.
 * Exposed for system lifecycle and testing.
 */
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

/**
 * Internal: Deletes screenshot files.
 */
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

// Export helper for tests/config
export function createLaunchOptionsForPlayWright() {
  return createLaunchOptions();
}
