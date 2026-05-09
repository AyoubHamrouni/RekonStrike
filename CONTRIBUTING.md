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
6. Run lint: `ruff check rekonstrike/`
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

```
rekonstrike/
├── rekonstrike/           # Python package
│   ├── api/              # FastAPI server (server.py, WebSocket)
│   ├── phases/           # Phase implementations (0-6)
│   ├── tools/            # Tool wrappers (subfinder, httpx, etc.)
│   ├── config.py         # Settings (Pydantic + YAML)
│   ├── database.py       # SQLAlchemy async models
│   ├── engine.py         # Phase pipeline engine
│   ├── runner.py         # Async subprocess runner
│   ├── scope.py          # Target scope validation
│   ├── scoring.py        # ROI scoring engine
│   └── tasks.py          # ARQ task queue
├── ui/                   # React + Vite frontend
│   └── src/
│       ├── components/   # React components (<300 lines each)
│       └── api.js        # API client
├── docker/               # Docker tool containers
├── tests/                # Pytest tests
├── migrations/           # Alembic migrations
└── README.md
```

## Code Style

- **Python**: Follow PEP 8, use type hints, no comments unless necessary
- **JavaScript/React**: Functional components, hooks, no class components
- **CSS**: Tailwind CSS v4 utility classes
- **Components**: Max 300 lines per file
- **Imports**: Standard library first, then third-party, then local

## Testing

- Backend: `python -m pytest tests/ -x -q`
- All 43+ tests must pass before merging
- New features should include tests

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
