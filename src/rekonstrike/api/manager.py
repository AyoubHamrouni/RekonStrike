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
            msg = json.dumps({"event": event, "data": data})
            for ws in self.active[session_id]:
                try:
                    await ws.send_text(msg)
                except Exception:
                    pass


manager = ConnectionManager()
