import { describe, it, expect } from "vitest";

/**
 * Debugging test for quote verification issues.
 *
 * Issue from mcp-debug.log:
 * [2026-01-10T14:07:38.801Z] [CitationExtractor] Rejected non-verbatim quote:
 *   "There are two main ways to serve Chicken Shawarma...."
 *
 * User confirmed this text exists on the webpage.
 */

// Copy the normalization and verification functions from citationExtractor.ts
// so we can test them in isolation

function normalizeForMatching(text: string): string {
  return (
    text
      .toLowerCase() // Case insensitive matching
      // Replace all non-alphanumeric characters (not letters, numbers, or whitespace) with a space
      // Using /u flag for Unicode support (\p{L} = Any Letter, \p{N} = Any Number)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      // Collapse multiple spaces into one and trim
      .replace(/\s+/g, " ")
      .trim()
  );
}

function verifyQuoteInSource(
  quote: string,
  sourceText: string,
  alternateSource?: string,
): boolean {
  // 1. Check Primary Source (Markdown)
  if (sourceText.includes(quote)) return true;

  const normalizedQuote = normalizeForMatching(quote);
  const normalizedSource = normalizeForMatching(sourceText);
  if (normalizedSource.includes(normalizedQuote)) return true;

  // 2. Check Alternate Source (Plain Text) if provided
  if (alternateSource) {
    if (alternateSource.includes(quote)) return true;
    const normalizedAlt = normalizeForMatching(alternateSource);
    if (normalizedAlt.includes(normalizedQuote)) return true;
  }

  return false;
}

// ============================================================================
// ACTUAL MARKDOWN FROM RECIPETINEATS PAGE (fetched via Turndown conversion)
// This allows offline testing without network requests
// ============================================================================
const ACTUAL_RECIPETINEATS_MARKDOWN = `hawarma_2.jpg)

## How to Serve Chicken Shawarma

There are two main ways to serve Chicken Shawarma.

1.  **Wraps –** As Chicken Shawarma wraps (like [Gyros](https://www.recipetineats.com/greek-chicken-gyros-with-tzatziki/) and [Doner kebabs](https://www.recipetineats.com/doner-kebab-meat-recipe-beef-or-lamb/)), with tomato, lettuce, and a simple yoghurt sauce on the side. Other optional extras include: red onion, cheese (query authenticity? But that's ok!!), [hummus](https://www.recipetineats.com/hummus/), hot sauce / chilli sauce.

2.  **Shawarma plate –** With rice and salads on the side`;

describe("Quote Verification Debugging", () => {
  // The exact quote that was rejected per the logs
  const rejectedQuote = "There are two main ways to serve Chicken Shawarma.";

  // ============================================================================
  // TESTS USING ACTUAL EMBEDDED MARKDOWN (OFFLINE)
  // ============================================================================
  describe("OFFLINE: Using actual RecipeTin Eats markdown", () => {
    it("should verify the exact rejected quote against actual markdown", () => {
      const quote = "There are two main ways to serve Chicken Shawarma.";

      console.log("\n=== OFFLINE TEST WITH ACTUAL MARKDOWN ===");
      console.log("Quote:", JSON.stringify(quote));
      console.log("Source length:", ACTUAL_RECIPETINEATS_MARKDOWN.length);

      // Exact match check
      const exactMatch = ACTUAL_RECIPETINEATS_MARKDOWN.includes(quote);
      console.log("Exact match in markdown:", exactMatch);

      // If no exact match, find out why
      if (!exactMatch) {
        // Try to find similar
        const searchTerm = quote.slice(0, 30);
        const idx = ACTUAL_RECIPETINEATS_MARKDOWN.indexOf(searchTerm);
        console.log(`Partial match '${searchTerm}': idx=${idx}`);

        if (idx >= 0) {
          const context = ACTUAL_RECIPETINEATS_MARKDOWN.slice(idx, idx + 60);
          console.log("Context:", JSON.stringify(context));
          // Check char by char
          for (let i = 0; i < quote.length && i < 60; i++) {
            const charInQuote = quote.charCodeAt(i);
            const charInSource = ACTUAL_RECIPETINEATS_MARKDOWN.charCodeAt(
              idx + i,
            );
            if (charInQuote !== charInSource) {
              console.log(
                `Mismatch at pos ${i}: quote='${quote[i]}' (${charInQuote}), source='${ACTUAL_RECIPETINEATS_MARKDOWN[idx + i]}' (${charInSource})`,
              );
              break;
            }
          }
        }
      }

      // Verify function result
      const verifyResult = verifyQuoteInSource(
        quote,
        ACTUAL_RECIPETINEATS_MARKDOWN,
      );
      console.log("verifyQuoteInSource result:", verifyResult);

      expect(verifyResult).toBe(true);
    });

    it("should verify the 'Wraps' quote with en-dash against actual markdown", () => {
      // The markdown has: "**Wraps –** As Chicken Shawarma wraps"
      // LLM might strip bold and return: "Wraps - As Chicken Shawarma wraps"
      // With normalization, BOTH should now match

      const quoteWithBoldAndEnDash = "**Wraps –** As Chicken Shawarma wraps";
      const quoteStripped = "Wraps - As Chicken Shawarma wraps"; // LLM version - no bold, hyphen instead of en-dash

      console.log("\n=== OFFLINE TEST: MARKDOWN STRIPPING ===");
      console.log(
        "Source has bold+en-dash version:",
        ACTUAL_RECIPETINEATS_MARKDOWN.includes(quoteWithBoldAndEnDash),
      );

      // Test that normalization strips the bold markers and normalizes dashes
      const normalizedSource = normalizeForMatching(
        ACTUAL_RECIPETINEATS_MARKDOWN,
      );
      const normalizedQuote = normalizeForMatching(quoteStripped);

      console.log(
        "Normalized source contains 'Wraps - As Chicken':",
        normalizedSource.includes("Wraps - As Chicken"),
      );
      console.log("Normalized quote:", JSON.stringify(normalizedQuote));
      console.log(
        "Quote found in normalized source:",
        normalizedSource.includes(normalizedQuote),
      );

      // This is the key test: LLM returns "Wraps - As Chicken..." (stripped, hyphen)
      // Source has "**Wraps –** As Chicken..." (bold, en-dash)
      // After normalization, they should match
      const verifyResult = verifyQuoteInSource(
        quoteStripped,
        ACTUAL_RECIPETINEATS_MARKDOWN,
      );
      console.log("verifyQuoteInSource result:", verifyResult);

      expect(verifyResult).toBe(true);
    });

    it("should verify the 'Shawarma plate' quote with en-dash", () => {
      // The markdown has: "**Shawarma plate –** With rice and salads"
      const quoteWithBoldAndEnDash =
        "**Shawarma plate –** With rice and salads";
      const quoteAsSubstring = "With rice and salads on the side";

      console.log("\n=== OFFLINE TEST: SHAWARMA PLATE QUOTE ===");
      console.log(
        "Source has bold+en-dash version:",
        ACTUAL_RECIPETINEATS_MARKDOWN.includes(quoteWithBoldAndEnDash),
      );
      console.log(
        "Source has substring:",
        ACTUAL_RECIPETINEATS_MARKDOWN.includes(quoteAsSubstring),
      );

      const verifySubstring = verifyQuoteInSource(
        quoteAsSubstring,
        ACTUAL_RECIPETINEATS_MARKDOWN,
      );
      console.log("verifyQuoteInSource (substring):", verifySubstring);

      expect(verifySubstring).toBe(true);
    });
  });

  // We'll need the actual source content to debug
  // For now, let's test with a simple mock that should work
  describe("normalizeForMatching", () => {
    it("should normalize basic text", () => {
      const result = normalizeForMatching("  Hello  World  ");
      console.log("Normalized:", JSON.stringify(result));
      expect(result).toBe("hello world");
    });

    it("should remove trailing punctuation", () => {
      const result = normalizeForMatching("Hello World.");
      console.log("Without trailing period:", JSON.stringify(result));
      expect(result).toBe("hello world");
    });

    it("should normalize various whitespace", () => {
      const input = "Hello\nWorld\t!";
      const result = normalizeForMatching(input);
      console.log("Input:", JSON.stringify(input));
      console.log("Output:", JSON.stringify(result));
      // Note: the "!" is NOT trailing punctuation if there's content after it
      // But in this case it IS trailing, so should be removed
    });

    it("should handle newlines in the middle", () => {
      const input = "There are two main ways\nto serve Chicken Shawarma.";
      const result = normalizeForMatching(input);
      console.log("Multi-line normalized:", JSON.stringify(result));
      expect(result).toBe("there are two main ways to serve chicken shawarma");
    });

    it("should handle case differences", () => {
      const result = normalizeForMatching("The Quick Brown Fox");
      expect(result).toBe("the quick brown fox");
    });
  });

  describe("verifyQuoteInSource", () => {
    it("should find exact match", () => {
      const source =
        "Blah blah. There are two main ways to serve Chicken Shawarma. More text.";
      const quote = "There are two main ways to serve Chicken Shawarma.";

      console.log("Source contains quote:", source.includes(quote));
      expect(verifyQuoteInSource(quote, source)).toBe(true);
    });

    it("should find quote even if source has extra whitespace", () => {
      const source =
        "Blah blah.  There  are  two  main  ways to serve Chicken Shawarma. More text.";
      const quote = "There are two main ways to serve Chicken Shawarma.";

      const result = verifyQuoteInSource(quote, source);
      console.log("With extra whitespace - Found:", result);

      // This should work because normalizeForMatching collapses whitespace
      // But currently it won't because normalizing the ENTIRE source is expensive
      // and might not help if the quote position is lost
    });

    it("should find quote across newlines", () => {
      // Simulating markdown where lines might be broken
      const source = `Some intro text.

There are two main ways to serve Chicken Shawarma.

More text follows.`;
      const quote = "There are two main ways to serve Chicken Shawarma.";

      console.log("=== Across Newlines Test ===");
      console.log("Source includes exact quote:", source.includes(quote));

      const normalizedQuote = normalizeForMatching(quote);
      const normalizedSource = normalizeForMatching(source);

      console.log("Normalized quote:", JSON.stringify(normalizedQuote));
      console.log(
        "Normalized source snippet:",
        JSON.stringify(normalizedSource.substring(0, 100)),
      );
      console.log(
        "Normalized source includes normalized quote:",
        normalizedSource.includes(normalizedQuote),
      );

      expect(verifyQuoteInSource(quote, source)).toBe(true);
    });

    it("REPRODUCTION: should handle the actual rejected quote pattern", () => {
      // The LLM likely extracted something like this
      const extractedQuote =
        "There are two main ways to serve Chicken Shawarma.";

      // The source might have it like this (markdown converted from HTML)
      const possibleSource1 =
        "## How to Serve\n\nThere are two main ways to serve Chicken Shawarma:\n\n* As a wrap";
      const possibleSource2 =
        "There are two main ways to serve Chicken Shawarma: in a wrap or as a bowl.";
      const possibleSource3 =
        "There are two main ways\nto serve Chicken Shawarma."; // Line break mid-sentence

      console.log("\n=== REPRODUCTION TEST ===");
      console.log("Quote to find:", JSON.stringify(extractedQuote));

      [possibleSource1, possibleSource2, possibleSource3].forEach(
        (source, i) => {
          console.log(
            `\nSource ${i + 1}:`,
            JSON.stringify(source.substring(0, 100)),
          );
          console.log(`  Exact includes: ${source.includes(extractedQuote)}`);
          console.log(
            `  Verify result: ${verifyQuoteInSource(extractedQuote, source)}`,
          );
        },
      );
    });

    it("DEBUG: check if colon after quote breaks matching", () => {
      // The actual page might have "There are two main ways to serve Chicken Shawarma:"
      // (with a colon), but the LLM extracted it with a period
      const quoteWithPeriod =
        "There are two main ways to serve Chicken Shawarma.";
      const sourceWithColon =
        "There are two main ways to serve Chicken Shawarma: as a wrap or bowl.";

      console.log("\n=== Punctuation Mismatch Test ===");
      console.log("Quote (period):", JSON.stringify(quoteWithPeriod));
      console.log("Source (colon):", JSON.stringify(sourceWithColon));

      const normalizedQuote = normalizeForMatching(quoteWithPeriod);
      const normalizedSource = normalizeForMatching(sourceWithColon);

      console.log("Normalized quote:", JSON.stringify(normalizedQuote));
      console.log("Normalized source:", JSON.stringify(normalizedSource));

      // The issue: normalizing the WHOLE source removes the colon at the END of the whole thing,
      // not in the middle! So "Shawarma:" becomes "Shawarma:" (unchanged because it's not at the end)

      // Let's check:
      console.log(
        "Source still has colon after normalize:",
        normalizedSource.includes("Shawarma:"),
      );
      // New behavior: colon is STRIPPED, so it should be FALSE
      expect(normalizedSource.includes("Shawarma:")).toBe(false);
      console.log("Quote after normalize:", normalizedQuote); // "There are two main ways to serve Chicken Shawarma"
      console.log("Match found:", normalizedSource.includes(normalizedQuote));

      expect(verifyQuoteInSource(quoteWithPeriod, sourceWithColon)).toBe(true);
    });

    // DUAL SOURCE VERIFICATION TEST
    it("should verify quote against alternate source (text) if markdown fails", () => {
      // Markdown source where the link breaks the phrase "Chicken Shawarma"
      const markdownSource =
        "Chicken [Shawarma](https://example.com) is tasty.";
      // Plain Text source which is clean
      const textSource = "Chicken Shawarma is tasty.";
      const quote = "Chicken Shawarma is tasty";

      // 1. Verify markdown fails (due to link content being included or just weird spacing)
      const resultMarkdownOnly = verifyQuoteInSource(quote, markdownSource);
      // With Aggressive Normalization, '[Shawarma](https://example.com)' becomes 'Shawarma https example com'
      // So 'Chicken Shawarma is tasty' WILL NOT match
      expect(resultMarkdownOnly).toBe(false);

      // 2. Verify passing text source SAVES the verification
      const result = verifyQuoteInSource(quote, markdownSource, textSource);
      expect(result).toBe(true);
    });
  });

  describe("LIVE DEBUG: Fetch actual page content", () => {
    it("should fetch RecipeTin Eats page and search for the quote", async () => {
      const url =
        "https://www.recipetineats.com/chicken-sharwama-middle-eastern/";
      const rejectedQuote = "There are two main ways to serve Chicken Shawarma";

      console.log("\n=== LIVE PAGE FETCH TEST ===");
      console.log("Fetching:", url);

      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
        });

        if (!response.ok) {
          console.log("Fetch failed:", response.status, response.statusText);
          return;
        }

        const html = await response.text();
        console.log("HTML length:", html.length);

        // Search for the quote in raw HTML
        const exactMatch = html.includes(rejectedQuote);
        console.log("Exact match in raw HTML:", exactMatch);

        // Search case-insensitive
        const lowerHtml = html.toLowerCase();
        const lowerQuote = rejectedQuote.toLowerCase();
        console.log("Case-insensitive match:", lowerHtml.includes(lowerQuote));

        // Find variations
        const searchPattern = "two main ways to serve";
        const patternMatch = html.includes(searchPattern);
        console.log(`Pattern "${searchPattern}" found:`, patternMatch);

        if (patternMatch) {
          // Extract surrounding context
          const idx = html.indexOf(searchPattern);
          const context = html.substring(Math.max(0, idx - 50), idx + 150);
          console.log("\nContext around pattern:");
          console.log(JSON.stringify(context));
        }

        // Also try searching just "There are two main ways"
        const simplePattern = "There are two main ways";
        if (html.includes(simplePattern)) {
          console.log(
            "\nFound 'There are two main ways' - extracting full context...",
          );
          const idx = html.indexOf(simplePattern);
          const fullContext = html.substring(idx, idx + 200);
          console.log(JSON.stringify(fullContext));
        }
      } catch (error) {
        console.log("Error fetching page:", error);
      }
    }, 30000); // 30 second timeout for network request

    it("ROOT CAUSE: LLM adds ellipsis (...) that doesn't exist in source", () => {
      // The source has:
      const source = "There are two main ways to serve Chicken Shawarma.";
      // But the LLM returned (with trailing ellipsis):
      const llmQuote = "There are two main ways to serve Chicken Shawarma....";

      console.log("\n=== ROOT CAUSE TEST ===");
      console.log("Source (actual):", JSON.stringify(source));
      console.log("LLM quote (with ellipsis):", JSON.stringify(llmQuote));

      // Current verification:
      const exactMatch = source.includes(llmQuote);
      console.log("Exact match:", exactMatch);

      const normalizedLLM = normalizeForMatching(llmQuote);
      const normalizedSource = normalizeForMatching(source);
      console.log("Normalized LLM quote:", JSON.stringify(normalizedLLM));
      console.log("Normalized source:", JSON.stringify(normalizedSource));

      // The problem: normalizeForMatching only removes [.!?,;:]+$
      // But "..." is THREE periods, and after removing them we get "Shawarma"
      // Let's check:
      console.log(
        "After normalization, match:",
        normalizedSource.includes(normalizedLLM),
      );

      // SOLUTION: We need to also strip trailing ellipsis "..."
      // Let's test that:
      function normalizeForMatchingFixed(text: string): string {
        return text
          .trim()
          .replace(/^["'""'']+|["'""'']+$/g, "") // Remove surrounding quotes
          .replace(/\.{2,}$/, "") // Remove trailing ellipsis (2+ dots)
          .replace(/[.!?,;:]+$/, "") // Remove trailing punctuation
          .replace(/\s+/g, " "); // Normalize whitespace
      }

      const fixedLLM = normalizeForMatchingFixed(llmQuote);
      const fixedSource = normalizeForMatchingFixed(source);
      console.log("\nWith fix:");
      console.log("Fixed LLM quote:", JSON.stringify(fixedLLM));
      console.log("Fixed source:", JSON.stringify(fixedSource));
      console.log("Match with fix:", fixedSource.includes(fixedLLM));

      // Test that both normalize to the same thing
      expect(fixedLLM).toBe(fixedSource);
    });

    it("CLARIFICATION: log adds '...' for truncation - check actual quote length", () => {
      // The log shows: "There are two main ways to serve Chicken Shawarma...."
      // But the logging code does: `"${quote.slice(0, 50)}..."`
      // So the ACTUAL quote is probably just:
      const actualQuote = "There are two main ways to serve Chicken Shawarma.";

      console.log("\n=== LOG TRUNCATION ANALYSIS ===");
      console.log("Quote length:", actualQuote.length);
      console.log("First 50 chars:", JSON.stringify(actualQuote.slice(0, 50)));
      console.log(
        "With logging suffix:",
        JSON.stringify(actualQuote.slice(0, 50) + "..."),
      );

      // If quote is exactly 50 chars when truncated, the . from the quote + "..." from log = "...."
      // Let's verify:
      expect(actualQuote.length).toBe(50); // "There are two main ways to serve Chicken Shawarma."
    });

    it("REAL TEST: visitPage converts HTML to markdown - check that output", async () => {
      // Initialize config for the test
      const { resetConfigForTesting } =
        await import("../../../../src/config/index.js");
      resetConfigForTesting();

      // Import the actual visitPage function to see what markdown is produced
      const { visitPage } =
        await import("../../../../src/engines/visit_page/visit.js");

      const url =
        "https://www.recipetineats.com/chicken-sharwama-middle-eastern/";
      console.log("\n=== VISIT PAGE MARKDOWN OUTPUT ===");
      console.log("Visiting:", url);

      try {
        const result = await visitPage(url);
        console.log("Visit result type:", typeof result);

        const markdown = result.content;
        console.log("Markdown length:", markdown?.length);

        // Search for our quote in the markdown
        const quote = "There are two main ways to serve Chicken Shawarma";
        const found = markdown?.includes(quote);
        console.log("Quote found in markdown:", found);

        if (found && markdown) {
          const idx = markdown.indexOf(quote);
          const context = markdown.substring(Math.max(0, idx - 20), idx + 80);
          console.log("\nMarkdown context:");
          console.log(JSON.stringify(context));
        }

        // Check for any weird characters
        if (markdown) {
          const idx = markdown.indexOf("Shawarma");
          if (idx > 0) {
            // Check for multiple occurrences and their contexts
            let searchIdx = 0;
            let count = 0;
            while (
              (searchIdx = markdown.indexOf("Shawarma", searchIdx)) !== -1 &&
              count < 5
            ) {
              const ctx = markdown.substring(searchIdx, searchIdx + 30);
              console.log(
                `Shawarma occurrence ${count + 1}:`,
                JSON.stringify(ctx),
              );
              searchIdx++;
              count++;
            }
          }
        }
      } catch (error) {
        console.log("Error:", error);
      }
    }, 60000);

    it("POSSIBLE CAUSE: en-dash (–) vs hyphen (-) mismatch", () => {
      // The log shows: "Wraps – As Chicken Shawarma wraps (like Gyros and ..."
      // Note the "–" which is an EN-DASH (U+2013), not a regular hyphen "-" (U+002D)

      // Source might have en-dash (from HTML &ndash;):
      const sourceWithEnDash = "Wraps – As Chicken Shawarma wraps";
      // LLM might copy it as regular hyphen:
      const quoteWithHyphen = "Wraps - As Chicken Shawarma wraps";

      console.log("\n=== EN-DASH VS HYPHEN TEST ===");
      console.log("Source (with en-dash):", JSON.stringify(sourceWithEnDash));
      console.log("Quote (with hyphen):", JSON.stringify(quoteWithHyphen));

      // Check character codes
      const dashInSource = sourceWithEnDash.charAt(6);
      const dashInQuote = quoteWithHyphen.charAt(6);
      console.log(
        "Source dash char code:",
        dashInSource.charCodeAt(0),
        `'${dashInSource}'`,
      );
      console.log(
        "Quote dash char code:",
        dashInQuote.charCodeAt(0),
        `'${dashInQuote}'`,
      );

      // Current verification fails:
      console.log("Exact match:", sourceWithEnDash.includes(quoteWithHyphen));
      console.log(
        "Verify result:",
        verifyQuoteInSource(quoteWithHyphen, sourceWithEnDash),
      );

      // The normalization doesn't handle dash variants!
      // We'd need to add: .replace(/[–—−]/g, "-") to normalize dashes

      function normalizeWithDashes(text: string): string {
        return text
          .trim()
          .replace(/^["'""'']+|["'""'']+$/g, "") // Remove surrounding quotes
          .replace(/[–—−]/g, "-") // Normalize dashes (en-dash, em-dash, minus)
          .replace(/[.!?,;:]+$/, "") // Remove trailing punctuation
          .replace(/\s+/g, " "); // Normalize whitespace
      }

      const fixedQuote = normalizeWithDashes(quoteWithHyphen);
      const fixedSource = normalizeWithDashes(sourceWithEnDash);
      console.log("\nWith dash normalization:");
      console.log("Fixed quote:", JSON.stringify(fixedQuote));
      console.log("Fixed source:", JSON.stringify(fixedSource));
      console.log("Match:", fixedSource.includes(fixedQuote));

      expect(fixedSource.includes(fixedQuote)).toBe(true);
    });

    it("POSSIBLE CAUSE: Smart Quotes (curly) vs Straight Quotes mismatch", () => {
      const sourceWithSmartQuotes = "He said “Hello World” to them.";
      const quoteWithStraightQuotes = 'He said "Hello World" to them.';

      console.log("\n=== SMART QUOTES TEST ===");
      console.log("Source:", JSON.stringify(sourceWithSmartQuotes));
      console.log("Quote:", JSON.stringify(quoteWithStraightQuotes));

      // Test current normalization
      const normalizedSource = normalizeForMatching(sourceWithSmartQuotes);
      const normalizedQuote = normalizeForMatching(quoteWithStraightQuotes);

      console.log("Normalized Source:", JSON.stringify(normalizedSource));
      console.log("Normalized Quote:", JSON.stringify(normalizedQuote));

      const match = normalizedSource.includes(normalizedQuote);
      console.log("Match:", match);

      // We EXPECT this to be true if normalization works, but it might verify false currently
      if (!match) {
        console.log("FAILURE: Smart quotes were not normalized!");
      }
      expect(match).toBe(true);
    });
  });
});

describe("Coverage Matrix: Proving all 4 matching ways", () => {
  // We need to define verification logic locally if not exported, or rely on the functions defined at top of file.
  // The file has local definitions of normalizeForMatching and verifyQuoteInSource.

  const markdown = "Go [here](link) for **bold** text.";
  const text = "Go here for bold text.";

  it("Level 1: Exact Match (Markdown)", () => {
    // Quote matches markdown exactly (including formatting)
    const quote = "Go [here](link) for **bold** text.";
    expect(verifyQuoteInSource(quote, markdown, text)).toBe(true);
  });

  it("Level 2: Normalized Match (Markdown)", () => {
    // Quote matches markdown content but has different case/symbols
    // Markdown: "Go [here](link) for **bold** text." -> norm: "go here link for bold text"
    // Quote: "GO [HERE](LINK) FOR **BOLD** TEXT." -> norm: "go here link for bold text"
    const quote = "GO [HERE](LINK) FOR **BOLD** TEXT.";
    expect(verifyQuoteInSource(quote, markdown, text)).toBe(true);
  });

  it("Level 3: Exact Match (Plain Text)", () => {
    // Quote matches plain text exactly (no markdown syntax)
    // Markdown fails because of [here](link) vs "here"
    const quote = "Go here for bold text.";
    expect(verifyQuoteInSource(quote, markdown, text)).toBe(true);
  });

  it("Level 4: Normalized Match (Plain Text)", () => {
    // Quote is text-only (no link syntax) AND has weird casing/spacing
    // Markdown norm fails because it has "link" word, Quote norm doesn't.
    // Plain text norm matches.
    const quote = "GO HERE   FOR BOLD TEXT";
    expect(verifyQuoteInSource(quote, markdown, text)).toBe(true);
  });

  it("Should FAIL if content is actually different", () => {
    const quote = "Go elsewhere for italic text";
    expect(verifyQuoteInSource(quote, markdown, text)).toBe(false);
  });
});

describe("Diabolical Edge Cases: Stress Testing", () => {
  const markdown = "Content";
  const text = "Content";

  it("Numbers with Separators: 1,000 vs 1000", () => {
    // LLM often normalizes numbers.
    // Logic: '1,000' -> clean symbols -> '1 000'. '1000' -> '1000'.
    // EXPECTATION: FAIL (Intentional stress test of current limits)
    const source = "We have 1,000 users.";
    const quote = "We have 1000 users.";
    expect(verifyQuoteInSource(quote, source)).toBe(false);
  });

  it("Diacritics/Accents: café vs cafe", () => {
    // Logic: 'café' stays 'café'. 'cafe' is 'cafe'.
    // EXPECTATION: FAIL (Intentional stress test)
    const source = "Visit our café today.";
    const quote = "Visit our cafe today.";
    expect(verifyQuoteInSource(quote, source)).toBe(false);
  });

  it("Zero-width spaces", () => {
    // Source has invisible zero-width space
    // 'User\u200bName' -> regex `[^\p{L}\p{N}\s]` strips it to SPACE.
    // "User Name".includes("UserName") -> False.
    const source = "User\u200bName";
    const quote = "UserName";
    expect(verifyQuoteInSource(quote, source)).toBe(false);
  });

  it("HTML Entities in Source: Non-Breaking Space", () => {
    // 'Chicken\u00A0Shawarma' -> \s matches it -> replaced with space.
    // EXPECTATION: PASS.
    const source = "Chicken\u00A0Shawarma";
    const quote = "Chicken Shawarma";
    expect(verifyQuoteInSource(quote, source)).toBe(true);
  });

  it("Emoji Pollution", () => {
    // "Enjoy 🐣 today" -> Norm -> "enjoy today" (emoji stripped).
    // EXPECTATION: PASS.
    const source = "Enjoy 🐣 today";
    const quote = "Enjoy today";
    expect(verifyQuoteInSource(quote, source)).toBe(true);
  });

  it("Repeated Words Edge Case", () => {
    // "that that" vs "that"
    const source = "I said that that was wrong";
    const quote = "said that was wrong";
    // "said that that was wrong".includes("said that was wrong") -> FALSE
    expect(verifyQuoteInSource(quote, source)).toBe(false);
  });
});
