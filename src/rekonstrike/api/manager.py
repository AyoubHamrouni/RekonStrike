import json
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active: dict[int, list[WebSocket]] = {}

    async def connect(self, session_id: int, ws: WebSocket):
        await ws.accept()
        if session_id not in self.active:
            self.active[session_id] = []
        self.active[session_id].append(ws)

    def disconnect(self, session_id: int, ws: WebSocket):
        if session_id in self.active:
            self.active[session_id].remove(ws)
            if not self.active[session_id]:
                del self.active[session_id]

    async def broadcast(self, session_id: int, event: str, data: dict):
        if session_id in self.active:
            # Flatten structured payloads so clients receive a single top-level
            # JSON object. Preserve `event` while merging any fields from
            # `data` (which may already be a structured payload from the engine).
            payload = data.copy() if isinstance(data, dict) else {"payload": data}
            msg_obj = {"event": event}
            # Merge payload fields into the top-level message. This means
            # fields like `type`, `session_id`, `timestamp`, and `payload`
            # will appear at the top level for easier client consumption.
            msg_obj.update(payload)
            msg = json.dumps(msg_obj)
            for ws in self.active[session_id]:
                try:
                    await ws.send_text(msg)
                except Exception:
                    # Ignore individual websocket failures; connection cleanup
                    # will be handled on disconnect.
                    pass


manager = ConnectionManager()
