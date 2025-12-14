# Recent Changes

## Last 14 Commits

### 1. feat(test): Migrate tests to Vitest and refactor engine tests with comprehensive coverage (64b9089a)

**Date:** Fri Aug 29 22:10:52 2025 +0200

Migrates all existing tests from a custom test runner to Vitest for improved testing experience and capabilities, introducing a comprehensive test suite for search engines and utilities.

This commit:

- Replaces `src/test/test-*.ts` files with new Vitest-based tests in `.test/engines/`.
- Introduces dedicated test files for each search engine (Bing, Brave, DuckDuckGo).
- Adds new tests for `fetch`, `visit_page`, `visit_proxy`, and `isValidUrl` utilities.
- Configures Vitest using `vitest.config.ts` to include new test files and set up globals.
- Refactors engine tests to use `vi.mock` for `loadConfig` to ensure isolated testing of search functions.
- Enhances proxy testing within `visit_proxy.test.ts` to cover various proxy configurations (HTTP, HTTPS, SOCKS5 with authentication) and error handling.
- Ensures proxy configurations are correctly handled and tested within fetch and visit page modules.
- Verifies search engine results structure, content, and URL validity.
- Validates bot protection, suspicious title, and insufficient content detection in `visitPage`.
- Confirms graceful browser session cleanup after page visits in `visit_page.test.ts`.

### 2. feat: add graceful shutdown, env loading, and logging to main server (e3f7246a)

**Date:** Fri Aug 29 21:54:45 2025 +0200

- Load .env via dotenv/config for environment variable management
- Add SIGTERM/SIGINT/SIGHUP handlers to clean browser sessions and close logger streams
- Replace static config import with loadConfig() for dynamic configuration loading
- Rename setupTools → serverInitializer for improved clarity and consistency
- Integrate console debug capture and stream closing utilities from logger module
- Add comprehensive error handling for fatal server errors with process exit
- Refactor server initialization flow with cleaner code organization

### 3. feat(utils): add untracked URL validator and configurable debug logger (5c1eb86e)

**Date:** Fri Aug 29 21:51:37 2025 +0200

- Added URL validator utility in `src/utils/isValidUrl.ts`
- Added configurable debug logger in `src/utils/logger.ts`

### 4. feat: add webpage visiting tool && refactor: search architecture (53c6852e)

**Date:** Fri Aug 29 21:48:51 2025 +0200

- Add visit_webpage tool for URL content extraction with optional screenshots
- Refactor search architecture with modular engine structure
- Replace axios with centralized fetch utilities across all engines
- Rewrite DuckDuckGo search implementation, remove legacy searchDuckDuckGo.ts
- Introduce executeMultiEngineSearch helper for multi-engine orchestration
- Update Bing and Brave engines to use new modular structure
- Extract common fetch/visit utilities into dedicated modules
- Add server/helpers directory with response formatting utilities
- Refactor tool setup to server/initializer for better organization
- Remove unused search engines (Baidu, CSDN, Exa, GitHub, Juejin, Linux.do, Zhihu)

### 5. refactor: move tool setup to server/initializer and apply formatting (0433a51d)

**Date:** Fri Aug 29 21:35:19 2025 +0200

- Moved tool setup from src/tools/setupTools.ts to src/server/initializer.ts
- Applied code formatting improvements

### 6. chore: remove unused engines and tools for refactoring preparation (8ef4f364)

**Date:** Fri Aug 29 21:31:43 2025 +0200

- Deleted Baidu, CSDN, Exa, GitHub, Juejin, Linux.do, and Zhihu engines
- Removed fetch tools for articles and README content
- Updated search tool to reference only remaining engines (Bing, DuckDuckGo, Brave)
- Prepared codebase for upcoming search tool refactoring
- Updated documentation to reflect removed functionality

### 7. refactor(config): migrate to loader.ts with comprehensive proxy support (3be2c919)

**Date:** Fri Aug 29 17:07:25 2025 +0200

**BREAKING CHANGE:** Configuration system redesigned with breaking changes

- Replaced config.ts with loader.ts for better proxy handling
- Added support for multiple proxy protocols (HTTP/S, SOCKS4/4a/5)
- Introduced proper type safety with types from src/types/app-config.ts
- Changed from single defaultSearchEngine to array of defaultSearchEngines
- Added robust proxy validation and error handling
- Implemented proxy agent creation with auth support
- Configuration now returns immutable Readonly<AppConfig>

Environment variables changed:

- DEFAULT_SEARCH_ENGINE → DEFAULT_SEARCH_ENGINES (comma-separated)
- PROXY_URL → HTTP_PROXY/HTTPS_PROXY/SOCKS\*\_PROXY
- USE_PROXY, ENABLE_CORS, CORS_ORIGIN remain unchanged

### 8. feat(types): establish core type system for search MCP server (158c0bfe)

**Date:** Fri Aug 29 16:48:15 2025 +0200

- Add SupportedEngine type with bing, duckduckgo, and brave engines
- Create comprehensive AppConfig interface with proxy and CORS support
- Define McpError class with standardized error codes
- Add SearchResult interface for consistent search response structure
- Set up barrel exports in index.ts for clean module organization

### 9. Move config.ts into dedicated config/ directory (31eaa9fb)

**Date:** Fri Aug 29 16:44:43 2025 +0200

- Moved src/config.ts to src/config/config.ts

### 10. feat: Expand .gitignore for common development files (076f9df8)

**Date:** Fri Aug 29 16:29:31 2025 +0200

Adds comprehensive ignore rules for various development artifacts, including:

- Build outputs (dist, build, .next, .nuxt)
- Environment variables (.env files)
- Logs (npm-debug.log, yarn-debug.log)
- Cache directories (.cache, .parcel-cache, .eslintcache)
- IDE-specific files (.vscode, .idea)
- OS-specific files (.DS_Store, Thumbs.db)
- Test coverage reports (.nyc_output, coverage/)
- Playwright related files

This update improves repository cleanliness and prevents unnecessary files from being committed.

### 11. feat: Add initial .env file and update .gitignore (98aea188)

**Date:** Fri Aug 29 16:35:54 2025 +0200

Introduces a new `.env` file to manage server environment configurations, including settings for proxy, TLS certificates, and general debug options. This provides a centralized and flexible way to configure the application without modifying source code.

The `.gitignore` file has been updated to remove specific `.env*` entries, as the new `.env` file is intended to be committed as a template.

### 12. Refactor: Remove .env files from .gitignore (7448e8c1)

**Date:** Fri Aug 29 16:33:34 2025 +0200

- Removed .env files from .gitignore restrictions

### 13. docs: remove Chinese README to consolidate documentation (b7de6dd4)

**Date:** Fri Aug 29 13:39:11 2025 +0200

- Removed README-zh.md file to consolidate documentation into single README

### 14. chore: update package.json for more robust MCP server setup (6f128b92)

**Date:** Fri Aug 29 13:26:56 2025 +0200

- Rename package to mcp-open-websearch
- Reset version to 0.0.1
- Add vitest for testing
- Add proxy and environment dependencies
- Update scripts with test and proxy support
- Added launch-proxy.sh script for proxy management
