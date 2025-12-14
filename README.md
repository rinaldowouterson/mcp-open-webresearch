<div align="center">

# mcp-open-webresearch

[![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/rinaldowouterson/mcp-open-webresearch)](https://archestra.ai/mcp-catalog/rinaldowouterson__mcp-open-webresearch)
[![smithery badge](https://smithery.ai/badge/@rinaldowouterson/mcp-open-webresearch)](https://smithery.ai/server/@rinaldowouterson/mcp-open-webresearch)
![Version](https://img.shields.io/github/v/release/rinaldowouterson/mcp-open-webresearch)
![Issues](https://img.shields.io/github/issues/rinaldowouterson/mcp-open-webresearch)

</div>

A Model Context Protocol (MCP) server based on multi-engine search results, supporting free web search without API keys.

## Features

- Web search using multi-engine results
  - Bing
  - DuckDuckGo
  - Brave
- Webpage content extraction (visit_page)
- Comprehensive proxy support (HTTP/HTTPS, SOCKS4/4a/5)
- No API keys or authentication required
- Returns structured results with titles, URLs, and descriptions
- Configurable number of results per search
- Customizable default search engines (supports multiple)
- Environment-based configuration with .env support
- Debug logging options for troubleshooting

## License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.

The `src/engines/visit_page` module is based on the `mcp-webresearch` project by pashpashpash, which is licensed under the MIT License.
Copyright (c) 2024 The Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Installation Guide

### NPX Quick Start (Recommended)

The fastest way to get started:

```bash
# Basic usage
npx mcp-open-webresearch@latest

# With environment variables (Linux/macOS)
DEFAULT_SEARCH_ENGINE=duckduckgo ENABLE_CORS=true npx mcp-open-webresearch@latest

# Windows PowerShell
$env:DEFAULT_SEARCH_ENGINE="duckduckgo"; $env:ENABLE_CORS="true"; npx mcp-open-webresearch@latest

# Cross-platform (requires cross-env, Used for local development)
npm install -g mcp-open-webresearch
npx cross-env DEFAULT_SEARCH_ENGINE=duckduckgo ENABLE_CORS=true mcp-open-webresearch
```

## Configuration

### Environment Variables

| Variable                 | Default                 | Options                                                | Description                                            |
| ------------------------ | ----------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| `ENABLE_CORS`            | `false`                 | `true`, `false`                                        | Enable CORS support                                    |
| `CORS_ORIGIN`            | `*`                     | Any valid origin                                       | CORS origin configuration (use `*` for all origins)    |
| `DEFAULT_SEARCH_ENGINES` | `bing,duckduckgo,brave` | Comma-separated list of: `bing`, `duckduckgo`, `brave` | Default search engines to use (in order of preference) |
| `USE_PROXY`              | `false`                 | `true`, `false`                                        | Enable proxy support                                   |
| `HTTP_PROXY`             | -                       | Valid proxy URL                                        | HTTP proxy URL (e.g., `http://user:pass@proxy:8080`)   |
| `HTTPS_PROXY`            | -                       | Valid proxy URL                                        | HTTPS proxy URL                                        |
| `SOCKS5_PROXY`           | -                       | Valid SOCKS5 URL                                       | SOCKS5 proxy URL (takes precedence over HTTP/HTTPS)    |
| `SOCKS4A_PROXY`          | -                       | Valid SOCKS4a URL                                      | SOCKS4a proxy URL                                      |
| `SOCKS4_PROXY`           | -                       | Valid SOCKS4 URL                                       | SOCKS4 proxy URL                                       |
| `NODE_EXTRA_CA_CERTS`    | -                       | Path to CA cert file                                   | Path to corporate CA bundle or PEM certificate         |
| `WRITE_DEBUG_TERMINAL`   | `false`                 | `true`, `false`                                        | Write debug logs to terminal                           |
| `WRITE_DEBUG_FILE`       | `false`                 | `true`, `false`                                        | Write debug logs to file                               |
| `PORT`                   | `3000`                  | 1-65535                                                | Server port                                            |

### Configuration Precedence (Accuracy First)

**The configuration system follows a strict precedence hierarchy:**

1. **Environment variables** (`-e VAR=value` in Docker, shell exports) ← **HIGHEST AUTHORITY**
2. **.env file values** ← **ONLY if no environment variable exists**
3. **Application defaults** ← **Ultimate fallback**

> **💡 Clever insight:** This means you can override any .env setting without touching the file. Your `-e PORT=8080` will always beat `PORT=3000` in .env, making deployments predictable and configuration management clean.

### Proxy Configuration

The application supports multiple proxy protocols with the following priority order:

1. `SOCKS5_PROXY`
2. `SOCKS4A_PROXY`
3. `SOCKS4_PROXY`
4. `HTTPS_PROXY`
5. `HTTP_PROXY`

Only the first non-empty value in this order will be used.

#### Proxy URL Formats:

- **SOCKS5**: `socks5://[user:pass@]proxy:1080`
- **SOCKS4A**: `socks4a://[user:pass@]proxy:1080`
- **SOCKS4**: `socks4://[user:pass@]proxy:1080`
- **HTTPS**: `https://[user:pass@]proxy:8080`
- **HTTP**: `http://[user:pass@]proxy:8080`

For IPv6 addresses, use square brackets: `socks5://[2001:db8::1]:1080`

## Common Configurations

### Basic Usage

```bash
# Default configuration
npx mcp-open-webresearch@latest

# Enable CORS for web access
ENABLE_CORS=true npx mcp-open-webresearch@latest

# Use specific search engines (in order of preference)
DEFAULT_SEARCH_ENGINES=duckduckgo,bing npx mcp-open-webresearch@latest
```

### Proxy Examples

```bash
# HTTP/HTTPS proxy
USE_PROXY=true HTTP_PROXY=http://user:pass@proxy:8080 npx mcp-open-webresearch@latest

# SOCKS5 proxy
USE_PROXY=true SOCKS5_PROXY=socks5://user:pass@proxy:1080 npx mcp-open-webresearch@latest

# With corporate CA certificate
NODE_EXTRA_CA_CERTS=/path/to/ca-bundle.pem npx mcp-open-webresearch@latest
```

### Debugging

```bash
# Enable debug logging to terminal and file
WRITE_DEBUG_TERMINAL=true WRITE_DEBUG_FILE=true npx mcp-open-webresearch@latest
```

### Local Installation

1. Clone or download this repository
2. Install dependencies:

```bash
npm install
```

3. Build the server:

```bash
npm run build
```

4. Add the server to your MCP configuration:

**Cherry Studio:**

```json
{
  "mcpServers": {
    "mcp-open-webresearch": {
      "name": "Web Search MCP",
      "type": "streamableHttp",
      "description": "Multi-engine web search with article fetching",
      "isActive": true,
      "baseUrl": "http://localhost:3000/mcp"
    }
  }
}
```

**VSCode (Claude Dev Extension):**

```json
{
  "mcpServers": {
    "mcp-open-webresearch": {
      "transport": {
        "type": "streamableHttp",
        "url": "http://localhost:3000/mcp"
      }
    },
    "mcp-open-webresearch-sse": {
      "transport": {
        "type": "sse",
        "url": "http://localhost:3000/sse"
      }
    }
  }
}
```

**Claude Desktop:**

```json
{
  "mcpServers": {
    "mcp-open-webresearch": {
      "transport": {
        "type": "streamableHttp",
        "url": "http://localhost:3000/mcp"
      }
    },
    "mcp-open-webresearch-sse": {
      "transport": {
        "type": "sse",
        "url": "http://localhost:3000/sse"
      }
    }
  }
}
```

**NPX Command Line Configuration:**

```json
{
  "mcpServers": {
    "mcp-open-webresearch": {
      "args": ["mcp-open-webresearch@latest"],
      "command": "npx",
      "env": {
        "ENABLE_CORS": "true",
        "DEFAULT_SEARCH_ENGINES": "duckduckgo,bing,brave",
        "USE_PROXY": "true",
        "HTTP_PROXY": "http://proxy:8080"
      }
    }
  }
}
```

### Docker Deployment

#### Quick Start with Docker

```bash
# Build the image
docker build -t mcp-websearch .

# Run with default settings
docker run -p 3000:3000 mcp-websearch

# Run with custom port
docker run -p 8080:8080 -e PORT=8080 mcp-websearch

# Run with proxy configuration
docker run -p 3000:3000 \
  -e USE_PROXY=true \
  -e HTTP_PROXY=http://proxy:8080 \
  -e NODE_EXTRA_CA_CERTS=/etc/ssl/certs/corp.pem \
  mcp-websearch
```

#### Docker Compose (Production Ready)

```yaml
# docker-compose.yml
version: "3.8"
services:
  websearch:
    build: .
    ports:
      - "${PORT:-3000}:${PORT:-3000}"
    environment:
      - PORT=${PORT:-3000}
      - USE_PROXY=${USE_PROXY:-false}
      - HTTP_PROXY=${HTTP_PROXY:-}
      - HTTPS_PROXY=${HTTPS_PROXY:-}
      - NODE_EXTRA_CA_CERTS=${NODE_EXTRA_CA_CERTS:-}
    env_file:
      - .env
```

#### Using Pre-built Image

```bash
# Basic usage
docker run -d --name web-search -p 3000:3000 \
  -e ENABLE_CORS=true \
  -e CORS_ORIGIN=* \
  ghcr.io/rinaldowouterson/mcp-open-webresearch:latest

# With proxy support
docker run -d --name web-search -p 3000:3000 \
  -e ENABLE_CORS=true \
  -e USE_PROXY=true \
  -e HTTP_PROXY=http://proxy:8080 \
  -e HTTPS_PROXY=http://proxy:8080 \
  ghcr.io/rinaldowouterson/mcp-open-webresearch:latest
```

#### Advanced Docker Usage

**Mount custom .env file:**

```bash
docker run -p 3000:3000 --env-file ./my.env mcp-websearch
```

**Override specific .env values:**

```bash
# .env has PORT=3000, but you want 8080
docker run -p 8080:8080 -e PORT=8080 --env-file .env mcp-websearch
```

**Development with live reload:**

```bash
docker run -p 3000:3000 -v $(pwd):/app -w /app node:18 npm run dev
```

For all available environment variables, see the [Configuration](#configuration) section above.

Then configure in your MCP client:

```json
{
  "mcpServers": {
    "mcp-open-webresearch": {
      "name": "Web Search MCP",
      "type": "streamableHttp",
      "description": "Multi-engine web search with article fetching",
      "isActive": true,
      "baseUrl": "http://localhost:3000/mcp"
    },
    "mcp-open-webresearch-sse": {
      "transport": {
        "name": "Web Search MCP",
        "type": "sse",
        "description": "Multi-engine web search with article fetching",
        "isActive": true,
        "url": "http://localhost:3000/sse"
      }
    }
  }
}
```

## Usage Guide

The server provides two tools: `search` and `fetchGithubReadme`.

### search Tool Usage

```typescript
{
  "query": string,        // Search query
  "limit": number,        // Optional: Number of results to return (default: 10)
  "engines": string[]     // Optional: Engines to use (bing,duckduckgo,brave) default bing
}
```

Usage example:

```typescript
use_mcp_tool({
  server_name: "web-search",
  tool_name: "search",
  arguments: {
    query: "search content",
    limit: 3, // Optional parameter
    engines: ["bing", "duckduckgo", "brave"], // Optional parameter, supports multi-engine combined search
  },
});
```

Response example:

````json
[
  {
    "title": "Example Search Result",
    "url": "https://example.com",
    "description": "Description text of the search result...",
    "source": "Source",
    "engine": "Engine used"
  }
]
]

### fetchGithubReadme Tool Usage

Used to fetch complete content of GitHub README files.

```typescript
{
  "url": string    // URL from GitHub search results using the search tool
}
````

Usage example:

```typescript
use_mcp_tool({
  server_name: "web-search",
  tool_name: "fetchGithubReadme",
  arguments: {
    url: "https://github.com/username/repository",
  },
});
```

Response example:

```json
[
  {
    "content": "Example README content"
  }
]
]
```

## .env example

```bash
# MCP Server Environment Configuration
# Valid boolean values: true, false (case-insensitive)

# Node.js Environment Mode
NODE_ENV=production

# CORS Configuration
ENABLE_CORS=false
CORS_ORIGIN="*"

# Proxy Configuration
USE_PROXY=false



# Debug Configuration
DRY_RUN=false
WRITE_DEBUG_TERMINAL=false
WRITE_DEBUG_FILE=false

# Proxy URLs - checked in priority order:
# 1. SOCKS5_PROXY
# 2. SOCKS4A_PROXY
# 3. SOCKS4_PROXY
# 4. HTTPS_PROXY
# 5. HTTP_PROXY
# The first non-empty value will be used in node.js
SOCKS5_PROXY=
SOCKS4A_PROXY=
SOCKS4_PROXY=
HTTPS_PROXY=
HTTP_PROXY=


#################
# CERT_HOST_DIR
# This variable is used for pointing to a directory with one or more .crt files.
# It is intended for the Debian docker image and is mounted to /usr/local/share/ca-certificates
# update-ca-certificates is run to update the trust store with the certificates found in this directory
CERT_HOST_FOR_STORE=./certs/store
CERT_HOST_FOR_EXTRA=./certs/extra

#################
# NODE_EXTRA_CA_CERTS
# Absolute path to corporate CA bundle or PEM certificate that Node should trust.
# This should not be set to /etc/ssl/certs/ca-certificates.crt if using system trust store.
NODE_EXTRA_CA_CERTS=/path/to/ca.pem



# Search Engine Configuration
# Valid values: bing, duckduckgo, brave
DEFAULT_SEARCH_ENGINES=bing,duckduckgo,brave
```
