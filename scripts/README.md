Rekonstrike developer scripts

This directory contains non-packaged developer scripts. They are intentionally
kept outside the package so they are opt-in and do not change project
packaging/entrypoints.

`rekonstrike_cli.py`
- Lightweight Rich-powered CLI for local development and debugging.
- Usage examples:

```bash
# Serve the API locally (same as `python -m rekonstrike`)
python scripts/rekonstrike_cli.py serve --host 0.0.0.0 --port 8000

# Run a simple health check
python scripts/rekonstrike_cli.py health

# Run a quick scan (developer mode)
python scripts/rekonstrike_cli.py run-scan --target example.com
```

Notes
- This script is NOT installed by default. If you want packaging convenience,
  I can add an optional `project.scripts` entry in `pyproject.toml`.
