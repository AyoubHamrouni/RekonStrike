Cleanup proposal — RekonStrike

Summary
- Completed: removed packaged Typer CLI, centralized startup to `python -m rekonstrike`.
- Goal: finish repository cleanup and provide actionable, non-destructive steps maintainers can run.

Findings
- No `dist/`, `build/`, or `.egg-info` artifacts checked into repository.
- No `rekonstrike` entrypoint scripts found inside the repo virtualenvs `pytest_venv` or `venv_test`.
- Runtime `create_all()` calls were removed and guidance added to use Alembic migrations.

Proposed non-destructive cleanup steps
1. Recreate local virtualenv to remove stale entrypoints (developer machines):

   ```bash
   rm -rf .venv
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -e .
   ```

2. Sync `requirements.txt` with `pyproject.toml` dependencies or remove `requirements.txt` if not needed for CI.
3. Optionally add a pre-commit configuration (ruff + isort) to avoid formatting drift.
4. Add `scripts/README.md` documenting `scripts/rekonstrike_cli.py` usage and explaining it is not packaged.
5. Run `ruff check src/rekonstrike/` and `pytest -q` in CI to catch regressions early (database tests require a test Postgres).

Quick verification commands

```bash
# Syntax check
PYTHONPATH=src python -m py_compile $(find src/rekonstrike -name '*.py')
# Lint (if ruff installed)
ruff check src/rekonstrike/
# Run tests (requires Postgres / test DB)
python -m pytest tests/ -q
```

Notes
- I intentionally left the new `scripts/rekonstrike_cli.py` outside the package so packaging isn't changed. If you want it packaged for convenience, I can add a non-default script entry under `[project.scripts]`.
- The engine event payloads were standardized; frontend changes will be minimal because the API WebSocket and the manager broadcast now forward the structured payloads inside the `data` field.
