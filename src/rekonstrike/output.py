"""Logging-backed output adapter.

Replaces terminal-only Rich printing with structured logging so the backend
can be UI-first while preserving the `out` API used across phases.
"""

import logging

logger = logging.getLogger("rekonstrike")


class Output:
    @staticmethod
    def banner():
        logger.info("RekonStrike — Reconnaissance & Asset Discovery Engine v0.1.0")

    @staticmethod
    def info(msg: str):
        logger.info(msg)

    @staticmethod
    def success(msg: str):
        logger.info(msg)

    @staticmethod
    def warning(msg: str):
        logger.warning(msg)

    @staticmethod
    def error(msg: str):
        logger.error(msg)

    @staticmethod
    def phase(num: int, name: str, desc: str = ""):
        logger.info("Phase %s: %s %s", num, name, f"- {desc}" if desc else "")

    @staticmethod
    def table(title: str, columns: list[str], rows: list[list]):
        logger.info("%s: %s rows", title, len(rows))

    @staticmethod
    def result(title: str, items: list[str], max_show: int = 20):
        logger.info("%s (%d)", title, len(items))
        for item in items[:max_show]:
            logger.info("  - %s", item)

    @staticmethod
    def divider():
        logger.info("---")

    @staticmethod
    def stat(label: str, value: str):
        logger.info("%s: %s", label, value)

    @staticmethod
    def panel(title: str, content: str, style: str = "blue"):
        logger.info("%s: %s", title, content)


out = Output()
