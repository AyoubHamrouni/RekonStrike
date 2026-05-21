"""Re-export from integrations package for backward compatibility."""
from ..integrations.browser_client import BrowserClient as BrowserCaptureClient

__all__ = ["BrowserCaptureClient"]
