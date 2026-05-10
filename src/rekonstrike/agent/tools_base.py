from abc import ABC, abstractmethod

class ToolBase(ABC):
    name: str = ""
    description: str = ""

    @abstractmethod
    async def execute(self, **kwargs) -> dict:
        """
        Must return a dict with keys: success (bool), data (any), error (str|None), duration_seconds (float)
        """
        pass

    async def validate_input(self, **kwargs) -> tuple[bool, str]:
        """
        Returns (is_valid, error_message). Default implementation returns (True, "").
        """
        return True, ""
