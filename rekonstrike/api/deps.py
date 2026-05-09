from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from ..config import load_settings
from ..database import Database
from ..tasks import get_task_manager

settings = load_settings()
db = Database(settings)

security = HTTPBearer(auto_error=False)

async def verify_auth(credentials: HTTPAuthorizationCredentials | None = Depends(security)):
    if not settings.server_api_key:
        return True
    if credentials is None or credentials.credentials != settings.server_api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return True

def get_db() -> Database:
    return db

def get_tm():
    return get_task_manager(settings.redis_url, settings)
