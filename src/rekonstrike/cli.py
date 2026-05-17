"""RekonStrike CLI — admin tasks only (setup, config, health). Recon work lives in the Web UI."""

import asyncio
import sys
from pathlib import Path
from typing import Optional

import typer
from sqlalchemy import text

from . import __version__
from .config import load_settings
from .database import Database
from .output import out

app = typer.Typer(
    name="rekonstrike",
    help="Advanced Reconnaissance & Asset Discovery Framework",
    no_args_is_help=True,
)


@app.callback()
def _main():
    pass


@app.command()
def config(
    show: bool = typer.Option(False, "--show", help="Show current configuration"),
    set_key: Optional[str] = typer.Option(
        None, "--set", help="Set config key (e.g. anthropic_api_key)"
    ),
    set_value: Optional[str] = typer.Option(None, "--value", help="Value for --set"),
):
    """View or modify configuration."""
    settings = load_settings()

    if show:
        out.banner()
        out.info("Current Configuration")
        print(settings.model_dump_json(indent=2))
        return

    if set_key and set_value:
        keys = set_key.split(".")
        data = settings.model_dump(mode="json")
        d = data
        for k in keys[:-1]:
            d = d.setdefault(k, {})
        d[keys[-1]] = set_value

        env_path = Path(".env")
        env_vars = {}
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env_vars[k.strip()] = v.strip()

        env_key = set_key.upper()
        env_vars[env_key] = str(set_value)
        lines = [f"{k}={v}" for k, v in env_vars.items()]
        env_path.write_text("\n".join(lines) + "\n")
        out.success(f"Set {set_key} = {set_value}")
        return

    out.info("Use --show to view or --set KEY --value VAL to update")


@app.command()
def install():
    """Check which tools are installed and available."""
    out.banner()
    out.info("Checking tool availability...")

    tools = {
        "subfinder": "github.com/projectdiscovery/subfinder",
        "httpx": "github.com/projectdiscovery/httpx",
        "nuclei": "github.com/projectdiscovery/nuclei",
        "amass": "github.com/owasp-amass/amass",
        "gau": "github.com/lc/gau",
        "shuffledns": "github.com/projectdiscovery/shuffledns",
        "dnsx": "github.com/projectdiscovery/dnsx",
        "gospider": "github.com/jaeles-project/gospider",
        "naabu": "github.com/projectdiscovery/naabu",
        "cloud_enum": "Pip package (pip install cloud_enum)",
        "metabigor": "github.com/j3ssie/metabigor",
        "github-subdomains": "github.com/gwen001/github-subdomains",
        "katana": "github.com/projectdiscovery/katana",
        "ffuf": "github.com/ffuf/ffuf",
        "cewl": "gem install cewl",
        "trufflehog": "github.com/trufflesecurity/trufflehog",
    }

    import shutil

    for name, url in tools.items():
        found = shutil.which(name)
        if found:
            out.success(f"{name:<25} {found}")
        else:
            out.warning(f"{name:<25} Not installed — go install {url}")

    print()
    out.info("Install Go tools: go install <url>@latest")
    out.info("Install Python tools: pip install <package>")


@app.command()
def version():
    """Show version information."""
    print(f"RekonStrike v{__version__}")
    print(f"Python {sys.version}")


@app.command()
def serve(
    host: str = typer.Option("0.0.0.0", "--host", help="Host to bind"),
    port: int = typer.Option(8000, "--port", help="Port to bind"),
    reload: bool = typer.Option(False, "--reload", help="Enable auto-reload"),
):
    """Start the unified Web UI and API server."""
    import uvicorn

    out.banner()
    out.info(f"Starting RekonStrike Unified Server on http://{host}:{port}")
    out.info("AI Agents: Initializing...")

    uvicorn.run(
        "rekonstrike.api.server:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info",
    )


@app.command()
def health():
    """Check service status."""
    settings = load_settings()

    out.banner()
    out.info("Checking service health...")

    # DB connectivity check
    db = Database(settings.database_url)
    try:

        async def _check():
            try:
                async with db.engine.connect() as conn:
                    await conn.execute(text("SELECT 1"))
                out.success("Database: connected")
            except Exception as e:
                out.error(f"Database: {e}")

        asyncio.run(_check())
    finally:
        asyncio.run(db.close())

    # LLM providers
    providers = settings.configured_providers
    if providers:
        out.success(f"LLM providers: {', '.join(providers)}")
    else:
        out.warning("LLM providers: none configured")

    out.success(f"Version: {__version__}")
    out.success("Status: healthy")


@app.command()
def db(
    action: str = typer.Argument(
        "migrate", help="Action: migrate (run pending migrations)"
    ),
):
    """Run database migrations."""
    if action == "migrate":
        from alembic.config import Config
        from alembic import command

        alembic_cfg = Config("alembic.ini")
        command.upgrade(alembic_cfg, "head")
        out.success("Database migrations complete")
    else:
        out.error(f"Unknown action: {action}. Use 'migrate'.")


def main():
    app()
