import hashlib
import json
from typing import Any


class MockThreatLLM:
    def __init__(self):
        self.fixtures: dict[str, dict[str, Any]] = {}

    def register(self, input_json: str, golden_json: str):
        key = self._hash(input_json)
        self.fixtures[key] = json.loads(golden_json)

    def _hash(self, s: str) -> str:
        return hashlib.sha256(s.encode()).hexdigest()

    async def ainvoke(self, surface_json: str):
        input_text = surface_json if isinstance(surface_json, str) else str(surface_json)
        key = self._hash(input_text)
        result = self.fixtures.get(
            key,
            {
                "findings": [],
                "privilege_escalation_chains": [],
                "session_recommendations": ["No fixture found for input"],
            },
        )
        return _MockResponse(content=json.dumps(result))


class _MockResponse:
    def __init__(self, content: str):
        self.content = content
