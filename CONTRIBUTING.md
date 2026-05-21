# Contributing to RekonStrike

First off, thank you for considering contributing! RekonStrike is built for the bug bounty and security community, and every contribution helps.

## Code of Conduct

Be respectful, inclusive, and constructive. We're all here to learn and build something useful.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/your-org/rekonstrike/issues)
2. If not, open a new issue with:
   - A clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Python version, tool versions)

### Suggesting Features

1. Open an issue describing the feature, why it's useful, and how it should work
2. Tag it with `enhancement`
3. Discuss with maintainers before implementing major changes

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes following the code style
4. Add or update tests as needed
5. Run tests: `python -m pytest tests/ -x -q`
6. Run lint: `ruff check src/rekonstrike/`
7. Ensure the frontend builds: `cd ui && npm run build`
8. Submit a PR with a clear description of the changes

## Development Setup

```bash
# Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install ruff pytest pytest-asyncio pytest-mock

# Frontend
cd ui && npm install && npm run dev

# Browser service
cd browser-service && npm ci && npm run dev
```

## Project Structure

```
rekonstrike/
├── src/rekonstrike/      # Python package
│   ├── api/              # FastAPI routers, deps, server, rate limiting
│   ├── agent/            # LangGraph agent (state, graph, runner)
│   ├── ai/               # LLM factory, prompts (11 files), agents, schemas
│   ├── phases/           # Reconnaissance pipeline (8 phases)
│   ├── integrations/     # Browser service client
│   ├── platforms/        # HackerOne/Bugcrowd/Intigriti clients
│   ├── repositories/     # Persistence layer (repository pattern)
│   ├── services/         # Scan orchestration
│   ├── tools/            # Go tool wrappers
│   ├── database.py       # SQLAlchemy models (20+ tables)
│   ├── config.py         # Pydantic-settings
│   └── engine.py         # Pipeline orchestrator
├── browser-service/      # Playwright headless capture (Express)
├── proxy-service/        # mitmproxy addon (separate process)
├── filter/               # Go-based traffic normalization CLI
├── ui/                   # Next.js frontend
├── tests/                # Python test suite (148+ tests)
└── docker/               # Tool isolation containers
```

## Code Style

- **Python**: Follow PEP 8, use strict type hints, follow the Repository pattern for all DB access.
- **TypeScript/React/Next.js**: Functional components, hooks, modern state management.
- **Testing**: New features should include unit tests for repositories and services.

## Testing

```bash
# Backend tests
python -m pytest tests/ -x -q

# Browser service tests
cd browser-service && npx jest

# Lint check
ruff check src/rekonstrike/
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
