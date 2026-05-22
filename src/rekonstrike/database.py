"""Database models and utilities — re-exported from models package.

This module exists so existing imports (from rekonstrike.database import ...)
continue to work after the models were split into src/rekonstrike/models/.
"""

from .models import (
    Base, Database, get_database, normalize_host,
    User,
    ScopeTarget, Subdomain, LiveHost, Endpoint, DNSRecord,
    Program, ProgramScope,
    ScanSession, ScanArtifact,
    AIInsight, AIVectorMemory,
    Vulnerability, FindingReport, SecretFinding, TakeoverFinding,
    RawHTTPCapture, BrowserCapture,
    TestingSession, TestResult,
    ProgramAnalysis,
    Report,
)

__all__ = [
    "Base", "Database", "get_database", "normalize_host",
    "User",
    "ScopeTarget", "Subdomain", "LiveHost", "Endpoint", "DNSRecord",
    "Program", "ProgramScope",
    "ScanSession", "ScanArtifact",
    "AIInsight", "AIVectorMemory",
    "Vulnerability", "FindingReport", "SecretFinding", "TakeoverFinding",
    "RawHTTPCapture", "BrowserCapture",
    "TestingSession", "TestResult",
    "ProgramAnalysis",
    "Report",
]
