# Contributing to mcp-open-webresearch

Thank you for considering contributing to this project!

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Install dependencies: `npm install`
4. Build the project: `npm run build`
5. Run tests: `npm test`

## Development Workflow

### Before Committing

```bash
npm run lint        # Check for linting issues
npm run lint:fix    # Auto-fix linting issues
npm run format      # Format code with Prettier
npm test            # Run all tests
```

### Adding a New Search Engine

See `README.md` → "Developer Guide: Adding New Engines"

## Pull Request Process

1. Ensure all tests pass (`npm test`)
2. Run linting (`npm run lint`)
3. Update documentation if needed
4. Describe your changes clearly in the PR

## Code Style

- TypeScript with strict mode
- Prettier for formatting (see `.prettierrc`)
- ESLint for linting (see `eslint.config.js`)

## Questions?

Open an issue for discussion.
