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
pip install pytest ruff  # dev dependencies

# Frontend
cd ui
npm install
npm run dev
```

## Project Structure

RekonStrike follows a decoupled **Repository/Service Architecture**:

```
rekonstrike/
├── src/
│   └── rekonstrike/      # Python package
│       ├── api/          # Delivery Layer (FastAPI)
│       │   ├── routers/  # Modular API routes
│       │   ├── deps.py   # Dependency injection
│       │   └── manager.py
│       ├── services/     # Orchestration Layer
│       ├── repositories/ # Persistence Layer
│       ├── phases/       # Reconnaissance Phases
│       ├── tools/        # Async tool wrappers
│       ├── config.py     # Settings
│       ├── database.py   # Models
│       ├── engine.py     # Pipeline
│       ├── schemas.py    # Pydantic models
│       └── tasks.py      # Background tasks
├── ui/                   # Next.js frontend
├── docker/               # Tool isolation containers
├── tests/                # Automated test suite
└── migrations/           # Alembic database migrations
```

## Code Style

- **Python**: Follow PEP 8, use strict type hints, follow the Repository pattern for all DB access.
- **JavaScript/React/Next.js**: Functional components, hooks, modern state management, and framework-aware routing.
- **Components**: Maximum 300 lines per file to ensure maintainability.
- **Testing**: New features should include unit tests for repositories and services.

## Testing

- Backend: `python -m pytest tests/ -x -q`
- Ensure all tests pass before submitting a Pull Request.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
