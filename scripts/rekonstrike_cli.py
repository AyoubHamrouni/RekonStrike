#!/usr/bin/env python3
"""Optional local CLI driver for RekonStrike (Rich-powered). Not packaged.

Usage:
  python scripts/rekonstrike_cli.py serve --host 0.0.0.0 --port 8000
  python scripts/rekonstrike_cli.py health
  python scripts/rekonstrike_cli.py run-scan --target example.com

This script intentionally lives outside of the package so it doesn't alter
packaging/entrypoints and remains an opt-in developer tool.
"""

import sys
from argparse import ArgumentParser
from pathlib import Path
import asyncio

# Ensure package import works when run from repo root
ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

console = Console()


def serve(host: str, port: int, reload: bool = False):
    import uvicorn

    console.print(Panel(f"Starting RekonStrike API on {host}:{port}", title="rekonstrike"))
    uvicorn.run("rekonstrike.api.server:app", host=host, port=port, reload=reload)


async def _health():
    from rekonstrike.config import load_settings
    from rekonstrike.database import Database

    settings = load_settings()
    db = Database(settings.database_url)
    try:
        async with db.engine.connect() as conn:
            await conn.execute("SELECT 1")
        providers = settings.configured_providers
        table = Table(title="Service Health")
        table.add_column("Component")
        table.add_column("Status")
        table.add_row("Database", "connected")
        table.add_row("LLM Providers", ", ".join(providers) if providers else "none configured")
        console.print(table)
    except Exception as e:
        console.print(Panel(str(e), title="Health error", style="red"))
    finally:
        await db.close()


def health():
    asyncio.run(_health())


async def _run_scan(target: str, target_type: str = "wildcard", phases: list[int] | None = None):
    from rekonstrike.config import load_settings
    from rekonstrike.database import Database
    from rekonstrike.engine import Pipeline

    settings = load_settings()
    db = Database(settings.database_url)

    # Note: this driver does NOT run migrations automatically. Run
    # `alembic upgrade head` before invoking scans in environments with migrations.

    pipeline = Pipeline(settings, db)

    async def on_event(event: str, data: dict):
        console.log(f"EVENT {event}: {data}")

    try:
        await pipeline.run(target=target, target_type=target_type, phases=phases, event_callback=on_event)
    finally:
        await db.close()


def run_scan(target: str, target_type: str = "wildcard"):
    asyncio.run(_run_scan(target, target_type))


def main():
    p = ArgumentParser(prog="rekonstrike-cli")
    sub = p.add_subparsers(dest="cmd")

    s1 = sub.add_parser("serve")
    s1.add_argument("--host", default="0.0.0.0")
    s1.add_argument("--port", type=int, default=8000)
    s1.add_argument("--reload", action="store_true")

    s2 = sub.add_parser("health")

    s3 = sub.add_parser("run-scan")
    s3.add_argument("--target", required=True)
    s3.add_argument("--type", dest="target_type", default="wildcard")

    args = p.parse_args()
    if args.cmd == "serve":
        serve(args.host, args.port, args.reload)
    elif args.cmd == "health":
        health()
    elif args.cmd == "run-scan":
        run_scan(args.target, args.target_type)
    else:
        p.print_help()


if __name__ == "__main__":
    main()
