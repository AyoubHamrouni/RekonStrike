"""WebSocket connection manager — singleton instance."""
from .connection_manager import ConnectionManager

manager = ConnectionManager()

__all__ = ["manager"]
