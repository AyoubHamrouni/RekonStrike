"""RekonStrike CLI — built with Typer for fast, intuitive command-line operation"""

import asyncio
import sys
from pathlib import Path
from typing import Optional

import typer

from . import __version__
from .config import load_settings
from .database import Database
from .engine import Pipeline
from .phases import get_registered_phases
from .output import out
from .wordlists import ensure_wordlists

app = typer.Typer(
    name="rekonstrike",
    help="Advanced Reconnaissance & Asset Discovery Framework",
    no_args_is_help=True,
)


@app.callback()
def _main():
    pass


@app.command()
def scan(
    target: str = typer.Argument(..., help="Target domain, company name, or URL"),
    target_type: str = typer.Option(
        "wildcard", "-t", "--type", help="Target type: wildcard, domain, company, url"
    ),
    phases: str = typer.Option(
        None, "-p", "--phases", help="Phases to run (comma-separated, e.g. 0,1,2)"
    ),
    config: Optional[Path] = typer.Option(
        None, "-c", "--config", help="Path to config YAML file"
    ),
    verbose: bool = typer.Option(False, "-v", "--verbose", help="Verbose output"),
):
    """Run reconnaissance scan against a target.

    Examples:
      rekonstrike scan example.com                     # Full wildcard scan
      rekonstrike scan example.com -t domain -p 0,1,2  # Passive recon only
      rekonstrike scan "Acme Inc" -t company            # Company-level recon
      rekonstrike scan https://example.com/api -t url   # URL-specific scan
    """
    phase_nums = [int(x.strip()) for x in phases.split(",")] if phases else None
    settings = load_settings(str(config) if config else None)
    db = Database(settings)

    async def _run():
        await db.create_all()
        await ensure_wordlists(settings.data_dir)
        pipeline = Pipeline(settings, db)
        await pipeline.run(target, target_type, phases=phase_nums)
        await db.close()

    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        out.warning("\nScan interrupted by user")
        sys.exit(1)
    except Exception as e:
        out.error(f"Scan failed: {e}")
        if verbose:
            import traceback

            traceback.print_exc()
        sys.exit(1)


@app.command()
def config(
    show: bool = typer.Option(False, "--show", help="Show current configuration"),
    set_key: Optional[str] = typer.Option(
        None, "--set", help="Set config key (e.g. api_keys.shodan)"
    ),
    set_value: Optional[str] = typer.Option(None, "--value", help="Value for --set"),
    config_path: Optional[Path] = typer.Option(
        None, "-c", "--config", help="Path to config file"
    ),
):
    """View or modify configuration."""
    import yaml

    settings = load_settings(str(config_path) if config_path else None)

    if show:
        out.banner()
        out.info("Current Configuration")
        print(yaml.dump(settings.model_dump(mode="json"), default_flow_style=False))
        return

    if set_key and set_value:
        keys = set_key.split(".")
        data = settings.model_dump(mode="json")
        d = data
        for k in keys[:-1]:
            d = d.setdefault(k, {})
        d[keys[-1]] = set_value

        yaml_path = config_path or Path("config.yaml")
        yaml_path.parent.mkdir(parents=True, exist_ok=True)
        with open(yaml_path, "w") as f:
            yaml.dump(data, f, default_flow_style=False)
        out.success(f"Set {set_key} = {set_value}")
        return

    out.info("Use --show to view or --set KEY --value VAL to update")


@app.command()
def worker(
    config_path: Optional[Path] = typer.Option(
        None, "-c", "--config", help="Path to config YAML file"
    ),
):
    """Start the ARQ background worker for processing scan jobs."""
    settings = load_settings(str(config_path) if config_path else None)
    out.info(f"Starting ARQ worker (Redis: {settings.redis_url})")
    out.info("Press Ctrl+C to stop")

    from arq import create_pool
    from arq.worker import Worker as ArqWorker

    async def _run():
        redis = await create_pool(settings.redis_url)
        worker = ArqWorker(
            redis_pool=redis,
            functions=["rekonstrike.tasks:scan_task"],
            burst=False,
            poll_delay=1.0,
            max_burst_jobs=1,
        )
        try:
            await worker.run()
        finally:
            await redis.close()

    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        out.warning("\nWorker stopped")


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
def phases():
    """List all registered pipeline phases."""
    out.banner()
    out.info("RekonStrike Pipeline — 7 Phases")
    print()
    phase_details = {
        0: "Validates the target to ensure it's well-formed before investing compute time.",
        1: "Passive OSINT — finds subdomains from certificate logs, search engines, GitHub without touching the target. Best phase to start learning recon fundamentals.",
        2: "Active probing — resolves DNS, scans ports, checks cloud assets. Separates real infrastructure from stale DNS records.",
        3: "HTTP probing — detects web servers, technology stacks, SSL certs, response headers. Tells you what each host is running.",
        4: "Content discovery — crawls websites, fuzzes for hidden paths, fetches historical URLs. Finds admin panels, API docs, backup files.",
        5: "Vulnerability scanning — runs 10,000+ Nuclei templates. Automatically finds CVEs, misconfigurations, and exposures.",
        6: "ROI scoring — prioritizes findings so you know which hosts to investigate first. Focus on high-value targets.",
    }
    for p in get_registered_phases():
        out.stat(f"Phase {p['number']}", f"{p['name']}")
        detail = phase_details.get(p["number"], p["description"])
        print(f"  {detail}")
        print()


@app.command()
def version():
    """Show version information."""
    print(f"RekonStrike v{__version__}")
    print(f"Python {sys.version}")


def main():
    app()
