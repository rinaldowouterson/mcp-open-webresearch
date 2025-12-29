<div align="center">

# mcp-open-webresearch

![Version](https://img.shields.io/github/v/release/rinaldowouterson/mcp-open-webresearch)
![Issues](https://img.shields.io/github/issues/rinaldowouterson/mcp-open-webresearch)

</div>

Proxy-aware Model Context Protocol (MCP) server for web searching and content extraction.

I have designed this tool to be robust and respectful of complex network environments, including support for SOCKS and HTTP proxies. While I have done my best to implement secure practices (no API keys, strict CORS, non-root Docker execution), please rigorously evaluate it for your usecase.

## Features

- **Multi-Engine Search**: Aggregates results from Bing, DuckDuckGo, and Brave (incorporating intelligent rate-limiting).
- **Smart Sampling**: Uses LLM-based filtering to assess relevance and prevent context pollution.
- **Content Extraction**: Robust webpage visiting and content extraction (`visit_webpage`) using a headless browser.
- **Enterprise Proxy Support**: Full support for SOCKS5, HTTPS, and HTTP proxies.
- **Security Conscious**: No external API keys required. CORS and strict environment configuration.
- **Configurable**: Extensive configuration via environment variables and CLI arguments.
- **Docker Ready**: Production and Test images available via GHCR.

---

## Credits

This project includes work from the following contributors:

- **[Manav Kundra](https://github.com/mkundra)**: Initial implementation of the server.
- **[Aasee](https://github.com/Aas-ee)**: Added multiple search engines and Docker support.
- **[mzxrai](https://github.com/mzxrai)**: Core logic for the `visit_page` tool.

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

### Local Installation (Stdio)

To run the server locally (e.g., in Claude Desktop or Cline), use the following configuration.

> [!NOTE]
> Make sure to replace `/absolute/path/to/project` with the actual path to where you cloned this repository.

**File:** `mcp_config.json` (or typically `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS)

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

This server supports recent MCP standards (Streamable HTTP) for remote connections.

**Endpoint:** `http://localhost:3000/mcp`

**Configuration:**

To use this with an MCP client (like Claude Desktop), add the following to your `mcp_config.json`:

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

### Infrastructure Tests

Runs the infrastructure validation tests.

```bash
npm run test:infrastructure
```

---

## Available Scripts

In the project directory, you can run:

| Command                       | Description                                                                       |
| :---------------------------- | :-------------------------------------------------------------------------------- |
| `npm run build`               | Compiles the TypeScript source code to JavaScript in the `build/` folder.         |
| `npm run watch`               | Automatically recompiles the code when you verify changes (useful for dev).       |
| `npm run inspector`           | Launches a web-based UI to interactively test the MCP server tools and resources. |
| `npm start`                   | Runs the compiled server (must run `npm run build` first).                        |
| `npm test`                    | Runs the unit tests locally.                                                      |
| `npm run test:docker`         | Builds and runs the full integration test suite inside a Docker container.        |
| `npm run test:infrastructure` | Runs the infrastructure validation tests.                                         |
| `npm run generate-certs`      | Generates self-signed certificates for testing (automatically runs build first).  |

---

## Configuration

The server is highly configurable via Environment Variables or a `.env` file.

| Variable                 | Default                 | Description                             |
| :----------------------- | :---------------------- | :-------------------------------------- |
| `PORT`                   | `3000`                  | Port to listen on.                      |
| `ENABLE_CORS`            | `false`                 | Enable/Disable CORS.                    |
| `CORS_ORIGIN`            | `*`                     | Allowed CORS origin.                    |
| `DEFAULT_SEARCH_ENGINES` | `bing,duckduckgo,brave` | Comma-separated list of engines to use. |
| `ENABLE_PROXY`           | `false`                 | Global switch to enable proxy usage.    |
| `HTTP_PROXY`             | -                       | HTTP Proxy URL.                         |
| `HTTPS_PROXY`            | -                       | HTTPS Proxy URL.                        |
| `SOCKS5_PROXY`           | -                       | SOCKS5 Proxy URL (Highest Priority).    |
| `SAMPLING`               | `true`                  | Enable LLM-based result filtering.      |

| `WRITE_DEBUG_TERMINAL` | `false` | Output debug logs to stdout. |
| `WRITE_DEBUG_FILE` | `false` | Write debug logs to file. |

**Proxy Priority Order:**

1. `SOCKS5_PROXY`
2. `HTTPS_PROXY`
3. `HTTP_PROXY`

### Command Line Arguments

You can also configure the server using command-line arguments, which override environment variables:

| Argument            | Description                              |
| :------------------ | :--------------------------------------- |
| `--port <number>`   | Port to listen on                        |
| `--debug`           | Enable debug logging to stdout           |
| `--debug-file`      | Enable debug logging to file             |
| `--cors`            | Enable CORS                              |
| `--proxy <url>`     | Proxy URL (supports http, https, socks5) |
| `--engines <items>` | Comma-separated list of search engines   |
| `--sampling`        | Enable LLM-based sampling (default)      |
| `--no-sampling`     | Disable LLM-based sampling               |

Example:

```bash
npm start --debug --proxy socks5://localhost:1080
```

---

## Tools Documentation

### `search_web`

Performs a search across configured engines. When sampling is enabled, uses the client's LLM to filter out irrelevant results.

**Input Schema:**

```json
{
  "query": "Machine Learning trends 2024",
  "max_results": 10,
  "engines": ["bing", "brave"],
  "sampling": true
}
```

| Parameter     | Required | Description                                      |
| :------------ | :------- | :----------------------------------------------- |
| `query`       | Yes      | Search query string                              |
| `max_results` | No       | Maximum results (default: 10, max: 50)           |
| `engines`     | No       | Override default engines                         |
| `sampling`    | No       | Override global sampling setting for this search |

### `visit_webpage`

Visits a URL and returns the markdown content. Supports screenshots.

**Input Schema:**

```json
{
  "url": "https://example.com/article",
  "capture_screenshot": false
}
```

### `set_engines`

Updates the default search engines used by the server and persists them to `.env`.

**Input Schema:**

```json
{
  "engines": ["duckduckgo", "brave"]
}
```

### `get_engines`

Returns the currently configured default search engines.

**Input Schema:**

```json
{}
```

### `set_sampling`

Enables or disables LLM-based sampling for search results. When enabled, search results are evaluated by the client's LLM to filter out irrelevant or low-quality content. Persists to `.env`.

**Input Schema:**

```json
{
  "enabled": true
}
```

### `get_sampling`

Returns whether LLM-based sampling is currently enabled.

**Input Schema:**

```json
{}
```

---

## Roadmap

- [ ] **Deep Search**: Implement a deeper search similar to Deep Research offered by Google, OpenAI.
- [ ] **Keyless GitHub Adapter**: Implement an adapter for fetching and navigating GitHub content without requiring API tokens.

---

## License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.
