<div align="center">

# mcp-open-webresearch

![Version](https://img.shields.io/github/v/release/rinaldowouterson/mcp-open-webresearch)
![Issues](https://img.shields.io/github/issues/rinaldowouterson/mcp-open-webresearch)

</div>

Proxy-aware Model Context Protocol (MCP) server for web searching and content extraction.

I have designed this tool to be robust and respectful of complex network environments, including support for SOCKS and HTTP proxies. While I have done my best to implement secure practices (no API keys, strict CORS, non-root Docker execution), please rigorously evaluate it for your usecase.

## Features

- **Multi-Engine Search**: Aggregates results from Bing, DuckDuckGo, and Brave.
- **Content Extraction**: Robust webpage visiting and content extraction (`visit_webpage`) using a headless browser.
- **Enterprise Proxy Support**: Full support for SOCKS5, HTTPS, and HTTP proxies.
- **Security Conscious**: No external API keys required. CORS and strict environment configuration.
- **Configurable**: Extensive environment variable control for defaults and debugging.
- **Docker Ready**: Production and Test images available via GHCR.

---

## Honorable Mentions & Credits

This project stands on the shoulders of giants. I gratefully acknowledge the inspiration and foundations provided by:

- **[pskill9/web-search](https://github.com/pskill9/web-search)**: An original pioneer that introduced a google web search pipeline for MCP.
- **[Aas-ee/open-webSearch](https://github.com/Aas-ee/open-webSearch)**: Expanded the horizon with support for multiple search engines.
- **[mzxrai/mcp-webresearch](https://github.com/mzxrai/mcp-webresearch)**: Provided the basic functionality for the `visit_webpage` endpoint.

---

## Installation & Quick Start

### Docker (Recommended)

The easiest way to run the server is via the provided Docker images.

**Latest Stable Release:**

```bash
docker pull ghcr.io/rinaldowouterson/mcp-open-webresearch:latest
docker run -p 3000:3000 ghcr.io/rinaldowouterson/mcp-open-webresearch:latest
```

**Test/Debug Image:**

```bash
docker pull ghcr.io/rinaldowouterson/mcp-open-webresearch:test
```

```bash
docker pull ghcr.io/rinaldowouterson/mcp-open-webresearch:test
```

---

## How to Build and Run

### Locally

```bash
# 1. Clone the repository
git clone https://github.com/rinaldowouterson/mcp-open-webresearch.git
cd mcp-open-webresearch

# 2. Install dependencies
npm install

# 3. Build and Start
npm run build
npm start
```

### Docker (Production)

```bash
docker build -t mcp-websearch .
docker run -p 3000:3000 mcp-websearch
```

### Docker (Testing)

Run the full test suite in a container:

```bash
npm run test:docker
```

---

## How to Test

I believe in the importance of testing. This project includes both unit tests and integration tests.

### Unit & Local Tests

Runs the test suite using Vitest.

```bash
npm test
```

### Docker Integration Tests

Runs the entire test suite inside a Docker container, including proxy simulation.

```bash
npm run test:docker
```

---

## Available Scripts

In the project directory, you can run:

| Command                  | Description                                                                       |
| :----------------------- | :-------------------------------------------------------------------------------- |
| `npm run build`          | Compiles the TypeScript source code to JavaScript in the `build/` folder.         |
| `npm run watch`          | Automatically recompiles the code when you verify changes (useful for dev).       |
| `npm run inspector`      | Launches a web-based UI to interactively test the MCP server tools and resources. |
| `npm start`              | Runs the compiled server (must run `npm run build` first).                        |
| `npm test`               | Runs the unit tests locally.                                                      |
| `npm run test:docker`    | Builds and runs the full integration test suite inside a Docker container.        |
| `npm run generate-certs` | Generates self-signed certificates for testing (automatically runs build first).  |

---

## Configuration

The server is highly configurable via Environment Variables or a `.env` file.

| Variable                 | Default                 | Description                             |
| :----------------------- | :---------------------- | :-------------------------------------- |
| `PORT`                   | `3000`                  | Port to listen on.                      |
| `ENABLE_CORS`            | `false`                 | Enable/Disable CORS.                    |
| `CORS_ORIGIN`            | `*`                     | Allowed CORS origin.                    |
| `DEFAULT_SEARCH_ENGINES` | `bing,duckduckgo,brave` | Comma-separated list of engines to use. |
| `USE_PROXY`              | `false`                 | Global switch to enable proxy usage.    |
| `HTTP_PROXY`             | -                       | HTTP Proxy URL.                         |
| `HTTPS_PROXY`            | -                       | HTTPS Proxy URL.                        |
| `SOCKS5_PROXY`           | -                       | SOCKS5 Proxy URL (Highest Priority).    |

| `WRITE_DEBUG_TERMINAL` | `false` | Output debug logs to stdout. |
| `WRITE_DEBUG_FILE` | `false` | Write debug logs to file. |

**Proxy Priority Order:**

1. `SOCKS5_PROXY`
2. `HTTPS_PROXY`
3. `HTTP_PROXY`

---

## Tools Documentation

### `search_web`

Performs a search across configured engines.

**Input Schema:**

```json
{
  "query": "Machine Learning trends 2024",
  "max_results": 10,
  "engines": ["bing", "brave"] // Optional: override defaults
}
```

### `visit_webpage`

Visits a URL and returns the markdown content. Supports screenshots.

**Input Schema:**

```json
{
  "url": "https://example.com/article",
  "capture_screenshot": false
}
```

### `update_default`

Updates the default search engines used by the server and persists them to `.env`.

**Input Schema:**

```json
{
  "engines": ["duckduckgo", "brave"]
}
```

### `check_default`

Returns the currently configured default search engines.

**Input Schema:**

```json
{}
```

---

## Roadmap

- [ ] **Context Pollution Prevention**: Implement sampling to further process search results, investigating and aggregating only high-quality results to prevent polluting the LLM context.
- [ ] **Deep Search**: Implement a deeper search similar to Deep Research offered by Google, OpenAI, and Anthropic.
- [ ] **Brave Rate Limiting**: Introduce a 5-second timeout/cooldown for Brave to evade rate limits. If a request is made within this window, the engine will temporarily skip Brave and rely on Bing and DuckDuckGo.
- [ ] **Keyless GitHub Adapter**: Implement an adapter for fetching and navigating GitHub content without requiring API tokens.
- [ ] **CLI Interface**: Add support for command-line arguments (e.g., `--debug`, `--proxy`) to allow running with `npx` and configure the server.

---

## License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.
