# Search Engine Development Checklist

When developing a new search engine for `mcp-open-webresearch`, follow this checklist to ensure consistency and high-quality data for the sampling pipeline.

## 1. Clean Data Output

- [ ] **No Stubs**: If no results are found, return an empty array `[]`. Do NOT return a "No results found" placeholder object.
- [ ] **Valid URLs**: Ensure the `url` field contains a valid absolute URL starting with `http` or `https`.
- [ ] **No Fragments**: Remove anchor fragments (e.g., `#section-1`) unless they are part of the core content link (e.g., single-page apps).

## 2. URL Normalization (Source Level)

- [ ] **Resolve Redirects**: If the provider uses click-tracking redirects (like Bing's `ck/a`), decode them to the final destination URL _before_ returning the result.
- [ ] **Strip Tracking**: Remove known tracking parameters (e.g., `utm_*`, `fbclid`, `msclkid`) if the provider appends them.

## 3. Metadata Quality

- [ ] **Trim Content**: Always `.trim()` the `title` and `description` fields.
- [ ] **Snippet Extraction**: Ensure the `description` is as long as possible without including UI elements like "Next page" or ads.

## 4. Resilience & Performance

- [ ] **Rate Limit Awareness**: Implement `isRateLimited()` logic to prevent the server from spamming a blocked provider.
- [ ] **Engine Identifier**: Set the `engine` field to your engine's unique name (lower case).
- [ ] **Error Handling**: Catch engine-specific errors and return an empty array if a recovery isn't possible, rather than crashing the whole search process.
