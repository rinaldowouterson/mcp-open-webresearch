<div align="center">

# Open-WebSearch MCP Server

[![ModelScope](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/Aas-ee/3af09e0f4c7821fb2e9acb96483a5ff0/raw/badge.json&color=orange)](https://www.modelscope.cn/mcp/servers/Aasee1/open-webSearch)
[![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/Aas-ee/open-webSearch)](https://archestra.ai/mcp-catalog/aas-ee__open-websearch)
[![smithery badge](https://smithery.ai/badge/@Aas-ee/open-websearch)](https://smithery.ai/server/@Aas-ee/open-websearch)
![Version](https://img.shields.io/github/v/release/Aas-ee/open-websearch)
![License](https://img.shields.io/github/license/Aas-ee/open-websearch)
![Issues](https://img.shields.io/github/issues/Aas-ee/open-websearch)

**[🇨🇳 中文](./README-zh.md) | 🇺🇸 English**

</div>

A Model Context Protocol (MCP) server based on multi-engine search results, supporting free web search without API keys.

## Features

- Web search using multi-engine results
  - bing
  - duckduckgo
  - brave
- HTTP proxy configuration support for accessing restricted resources
- No API keys or authentication required
- Returns structured results with titles, URLs, and descriptions
- Configurable number of results per search
- Customizable default search engine
- Support for fetching individual article content
  - github (README files)

## TODO

- Support for ~~Bing~~ (already supported), ~~DuckDuckGo~~ (already supported), ~~Brave~~ (already supported), Google and other search engines
- Support for more blogs, forums, and social platforms
- Optimize article content extraction, add support for more sites
- ~~Support for GitHub README fetching~~ (already supported)

## Installation Guide

### NPX Quick Start (Recommended)

The fastest way to get started:

```bash
# Basic usage
npx open-websearch@latest

# With environment variables (Linux/macOS)
DEFAULT_SEARCH_ENGINE=duckduckgo ENABLE_CORS=true npx open-websearch@latest

# Windows PowerShell
$env:DEFAULT_SEARCH_ENGINE="duckduckgo"; $env:ENABLE_CORS="true"; npx open-websearch@latest

# Cross-platform (requires cross-env, Used for local development)
npm install -g open-websearch
npx cross-env DEFAULT_SEARCH_ENGINE=duckduckgo ENABLE_CORS=true open-websearch
```

**Environment Variables:**

| Variable                | Default                 | Options                       | Description               |
| ----------------------- | ----------------------- | ----------------------------- | ------------------------- |
| `ENABLE_CORS`           | `false`                 | `true`, `false`               | Enable CORS               |
| `CORS_ORIGIN`           | `*`                     | Any valid origin              | CORS origin configuration |
| `DEFAULT_SEARCH_ENGINE` | `bing`                  | `bing`, `duckduckgo`, `brave` | Default search engine     |
| `USE_PROXY`             | `false`                 | `true`, `false`               | Enable HTTP proxy         |
| `PROXY_URL`             | `http://127.0.0.1:7890` | Any valid URL                 | Proxy server URL          |
| `PORT`                  | `3000`                  | 1-65535                       | Server port               |

**Common configurations:**

```bash
# Enable proxy for restricted regions
USE_PROXY=true PROXY_URL=http://127.0.0.1:7890 npx open-websearch@latest

# Full configuration
DEFAULT_SEARCH_ENGINE=duckduckgo ENABLE_CORS=true USE_PROXY=true PROXY_URL=http://127.0.0.1:7890 PORT=8080 npx open-websearch@latest
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
    "web-search": {
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
    "web-search": {
      "transport": {
        "type": "streamableHttp",
        "url": "http://localhost:3000/mcp"
      }
    },
    "web-search-sse": {
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
    "web-search": {
      "transport": {
        "type": "streamableHttp",
        "url": "http://localhost:3000/mcp"
      }
    },
    "web-search-sse": {
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
    "web-search": {
      "args": ["open-websearch@latest"],
      "command": "npx"
    }
  }
}
```

### Docker Deployment

Quick deployment using Docker Compose:

```bash
docker-compose up -d
```

Or use Docker directly:

```bash
docker run -d --name web-search -p 3000:3000 -e ENABLE_CORS=true -e CORS_ORIGIN=* ghcr.io/aas-ee/open-web-search:latest
```

Environment variable configuration:

| Variable                | Default                 | Options                       | Description               |
| ----------------------- | ----------------------- | ----------------------------- | ------------------------- |
| `ENABLE_CORS`           | `false`                 | `true`, `false`               | Enable CORS               |
| `CORS_ORIGIN`           | `*`                     | Any valid origin              | CORS origin configuration |
| `DEFAULT_SEARCH_ENGINE` | `bing`                  | `bing`, `duckduckgo`, `brave` | Default search engine     |
| `USE_PROXY`             | `false`                 | `true`, `false`               | Enable HTTP proxy         |
| `PROXY_URL`             | `http://127.0.0.1:7890` | Any valid URL                 | Proxy server URL          |
| `PORT`                  | `3000`                  | 1-65535                       | Server port               |

Then configure in your MCP client:

```json
{
  "mcpServers": {
    "web-search": {
      "name": "Web Search MCP",
      "type": "streamableHttp",
      "description": "Multi-engine web search with article fetching",
      "isActive": true,
      "baseUrl": "http://localhost:3000/mcp"
    },
    "web-search-sse": {
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
