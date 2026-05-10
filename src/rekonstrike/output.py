"""Terminal output with Rich — progress bars, tables, panels, live display"""

from rich.console import Console as RichConsole
from rich.table import Table
from rich.panel import Panel
from rich import box

_console = RichConsole()


class Output:
    @staticmethod
    def banner():
        _console.print(
            Panel.fit(
                "[bold magenta]RekonStrike[/bold magenta] — [cyan]Reconnaissance & Asset Discovery Engine[/cyan]\n"
                "[dim]v0.1.0 • Python 3.14+ • Async-first • PostgreSQL[/dim]",
                border_style="bright_blue",
                padding=(1, 4),
            )
        )

    @staticmethod
    def info(msg: str):
        _console.print(f"[blue]⟐[/blue] {msg}")

    @staticmethod
    def success(msg: str):
        _console.print(f"[green]✓[/green] {msg}")

    @staticmethod
    def warning(msg: str):
        _console.print(f"[yellow]⚠[/yellow] {msg}")

    @staticmethod
    def error(msg: str):
        _console.print(f"[red]✗[/red] {msg}")

    @staticmethod
    def phase(num: int, name: str, desc: str = ""):
        _console.print()
        _console.rule(f"[bold magenta]Phase {num}: {name}[/bold magenta]")
        if desc:
            _console.print(f"[dim]{desc}[/dim]")

    @staticmethod
    def table(title: str, columns: list[str], rows: list[list]):
        table = Table(title=title, box=box.ROUNDED, header_style="bold cyan")
        for col in columns:
            table.add_column(col)
        for row in rows:
            table.add_row(*[str(c) for c in row])
        _console.print(table)

    @staticmethod
    def result(title: str, items: list[str], max_show: int = 20):
        _console.print(f"\n[bold]{title}[/bold] [dim]({len(items)})[/dim]")
        for item in items[:max_show]:
            _console.print(f"  [green]└─[/green] {item}")
        if len(items) > max_show:
            _console.print(f"  [dim]... and {len(items) - max_show} more[/dim]")

    @staticmethod
    def divider():
        _console.rule(style="dim")

    @staticmethod
    def stat(label: str, value: str):
        _console.print(f"  [cyan]{label}:[/cyan] {value}")

    @staticmethod
    def panel(title: str, content: str, style: str = "blue"):
        _console.print(Panel(content, title=title, border_style=style))


out = Output()
