<div align="center">

# mcp-open-webresearch

![Version](https://img.shields.io/github/v/release/rinaldowouterson/mcp-open-webresearch)
![Issues](https://img.shields.io/github/issues/rinaldowouterson/mcp-open-webresearch)

</div>

Proxy-aware Model Context Protocol (MCP) server for web searching and content extraction.

Designed to be robust and compatible with various network environments, including those using SOCKS and HTTP proxies.

## Features

- **Dynamic Engine Discovery**: Engines are loaded dynamically from the `src/engines/search/` directory. Adding a new engine requires only a new folder and file, without modifying core logic.
- **Multi-Engine Search**: Aggregates results from Bing, DuckDuckGo, and Brave.
- **Centralized Throttling**: functionality to manage rate limits (search and pagination cooldowns) across different engines.
- **Smart Fetch**: Configurable fetching utility (`impit`) with two modes:
  - **Browser Mode**: Emulates a modern browser (User-Agent, Client Hints, Headers) for compatibility with sites requiring browser-like requests.
  - **Standard Mode**: Uses a minimal HTTP client profile (no custom User-Agent) for environments where browser masquerading is not desired.
- **Result Sampling**: Optional LLM-based filtering to assess result relevance.
- **Content Extraction**: Webpage visiting and markdown extraction tool (`visit_webpage`) using a headless browser.
- **Proxy Support**: Full support for SOCKS5, HTTPS, and HTTP proxies.
- **Configuration**: Configurable via environment variables and CLI arguments.
- **Deployment**: Docker images available for production and testing.

---

## Credits

This project includes work from the following contributors:

- **[Manav Kundra](https://github.com/mkundra)**: Initial implementation of the server.
- **[Aasee](https://github.com/Aas-ee)**: Added multiple search engines and Docker support.
- **[mzxrai](https://github.com/mzxrai)**: Core logic for the `visit_page` tool.

---

## Installation & Quick Start

### Docker (Recommended)

**Latest Stable Release:**

```bash
docker pull ghcr.io/rinaldowouterson/mcp-open-webresearch:latest
docker run -p 3000:3000 ghcr.io/rinaldowouterson/mcp-open-webresearch:latest
```

**Test/Debug Image:**

```bash
docker pull ghcr.io/rinaldowouterson/mcp-open-webresearch:test
```

### Local Installation

To run the server locally (e.g., in Claude Desktop or Cline):

> [!NOTE]
> Replace `/absolute/path/to/project` with your actual project path.

**Configuration (`mcp_config.json`):**

```json
{
  "mcpServers": {
    "open-webresearch": {
      "command": "npm",
      "args": [
        "run",
        "start:sampling",
        "--silent",
        "--prefix",
        "/absolute/path/to/project"
      ],
      "headers": {},
      "disabled": false
    }
  }
}
```

### Remote Server (Streamable HTTP)

**Endpoint:** `http://localhost:3000/mcp`

**Configuration:**

```json
{
  "mcpServers": {
    "open-webresearch": {
      "serverUrl": "http://localhost:3000/mcp",
      "headers": {}
    }
  }
}
```

---

## Developer Guide: Adding New Engines

To add a new search engine:

1.  **Create Directory**: `src/engines/search/{engine_name}/`
2.  **Implement Logic**: Create `{engine_name}.ts` with the fetching/parsing logic.
3.  **Export Interface**: Create `index.ts` exporting the `SearchEngine` interface:

    ```typescript
    import type { SearchEngine } from "../../../types/search.js";
    import { searchMyEngine } from "./my_engine.js";
    import { isThrottled } from "../../throttle.js"; // Optional

    export const engine: SearchEngine = {
      name: "my_engine",
      search: searchMyEngine,
      isRateLimited: () => isThrottled("my_engine"),
    };
    ```

4.  **Restart**: The server will automatically discover and load the new engine.

---

## Build and Run

### Locally

```bash
# 1. Clone
git clone https://github.com/rinaldowouterson/mcp-open-webresearch.git
cd mcp-open-webresearch

# 2. Install
npm install

# 3. Build & Start
npm run build
npm start
```

### Docker

```bash
# Production
docker build -t mcp-websearch .
docker run -p 3000:3000 mcp-websearch

# Testing
npm run test:docker
```

---

## Testing

### Unit & E2E Tests

Uses **Vitest** for testing. Includes dynamic contract tests for all discovered engines.

```bash
npm test
```

### Compliance Tests

Verifies the "Smart Fetch" behavior (User-Agent headers) usage using a local mock server.

```bash
npm run test .test/engines/smart_fetch_mode.test.ts
```

### Infrastructure Validation

Validates Docker image builds and basic functionality.

```bash
npm run test:infrastructure
```

---

## Available Scripts

| Command                       | Description                                     |
| :---------------------------- | :---------------------------------------------- |
| `npm run build`               | Compiles TypeScript to `build/` folder.         |
| `npm run watch`               | Recompiles on file changes.                     |
| `npm run inspector`           | Launches MCP inspector UI.                      |
| `npm start`                   | Runs the compiled server.                       |
| `npm test`                    | Runs local tests.                               |
| `npm run test:docker`         | Runs tests in Docker container.                 |
| `npm run test:infrastructure` | Validates docker images.                        |
| `npm run generate-certs`      | Generates self-signed certificates for testing. |

---

## Configuration

Configuration is managed via Environment Variables or CLI arguments.

| Variable                 | Default                 | Description                          |
| :----------------------- | :---------------------- | :----------------------------------- |
| `PORT`                   | `3000`                  | Server port.                         |
| `ENABLE_CORS`            | `false`                 | Enable CORS.                         |
| `CORS_ORIGIN`            | `*`                     | Allowed CORS origin.                 |
| `DEFAULT_SEARCH_ENGINES` | `bing,duckduckgo,brave` | Default engines list.                |
| `ENABLE_PROXY`           | `false`                 | Enable proxy support.                |
| `HTTP_PROXY`             | -                       | HTTP Proxy URL.                      |
| `HTTPS_PROXY`            | -                       | HTTPS Proxy URL.                     |
| `SOCKS5_PROXY`           | -                       | SOCKS5 Proxy URL (Highest Priority). |
| `SAMPLING`               | `false`                 | Enable result sampling.              |
| `SKIP_IDE_SAMPLING`      | `false`                 | Prefer external API over IDE.        |
| `LLM_BASE_URL`           | -                       | External LLM API base URL.           |
| `LLM_API_KEY`            | -                       | External LLM API key.                |
| `LLM_NAME`               | -                       | External LLM model name.             |
| `LLM_TIMEOUT_MS`         | `30000`                 | Timeout for external LLM calls.      |
| `WRITE_DEBUG_TERMINAL`   | `false`                 | Log debug output to stdout.          |
| `WRITE_DEBUG_FILE`       | `false`                 | Log debug output to file.            |

### CLI Arguments

CLI arguments override environment variables.

| Argument            | Description                      |
| :------------------ | :------------------------------- |
| `--port <number>`   | Port to listen on.               |
| `--debug`           | Enable debug logging (stdout).   |
| `--debug-file`      | Enable debug logging (file).     |
| `--cors`            | Enable CORS.                     |
| `--proxy <url>`     | Proxy URL (http, https, socks5). |
| `--engines <items>` | Comma-separated list of engines. |
| `--sampling`        | Enable sampling.                 |
| `--no-sampling`     | Disable sampling.                |

---

## Search Pipeline & Scoring

The server uses a multi-stage pipeline to aggregate and refine search results:

### 1. Multi-Engine Retrieval

Concurrent requests are dispatched to all configured engines (Bing, Brave, DuckDuckGo). Raw results are collected into a single pool.

### 2. Consensus Scoring & Deduplication

Results are grouped by their canonical URL (protocol/www-agnostic hash).

- **Deduplication**: Multiple entries for the same URL are merged.
- **Scoring**: A `consensusScore` is calculated for each unique URL:
  - **Inverted Rank Sum**: Individual ranks from engines are inverted ($1/rank$) and summed. This rewards higher placement across engines.
  - **Engine Boost**: The sum is multiplied by the number of unique engines that found the URL. This rewards multi-provider agreement.
- **Sorting**: The final list is sorted by the calculated `consensusScore` in descending order.

### 3. LLM Sampling (Optional)

If `SAMPLING=true`, the top-ranked results are sent to an LLM to evaluate semantic relevance to the query.

- **Filtering**: Sampling acts as a binary filter. It removes results identified as irrelevant (spam, off-topic).
- **Final Set**: The original consensus scores are preserved. Only the composition of the list changes.

---

## LLM Sampling Strategy

When sampling is enabled, the server follows a tiered resolution logic to select which LLM to use:

| SKIP_IDE_SAMPLING | IDE Available | API Configured | Resolution       |
| ----------------- | ------------- | -------------- | ---------------- |
| `false` (default) | ✅            | ✅             | **IDE Sampling** |
| `true`            | ✅            | ❌             | **IDE Sampling** |
| `false`           | ❌            | ✅             | **External API** |
| `true`            | ✅ OR ❌      | ✅             | **External API** |
| `false` OR `true` | ❌            | ❌             | No Sampling      |

> [!TIP]
> You can use a model without API key, the `LLM_API_KEY` value is optional.

---

## Tools Documentation

### `search_web`

Performs a search across configured engines.

**Input:**

```json
{
  "query": "search query",
  "max_results": 10,
  "engines": ["bing", "brave"],
  "sampling": true
}
```

### `visit_webpage`

Visits a URL and returns markdown content.

**Input:**

```json
{
  "url": "https://example.com/article",
  "capture_screenshot": false
}
```

### `set_engines`

Updates default search engines.

**Input:**

```json
{
  "engines": ["duckduckgo", "brave"]
}
```

### `get_engines`

Returns configured search engines.

### `set_sampling`

Enables or disables result sampling.

**Input:**

```json
{
  "enabled": true
}
```

### `get_sampling`

Returns current sampling status.

---

## Roadmap

- [ ] **Deep Search**: Implement deeper search capabilities.
- [ ] **Keyless GitHub Adapter**: Implement adapter for GitHub content access.

---

## License

Apache License 2.0. See [LICENSE](LICENSE).
