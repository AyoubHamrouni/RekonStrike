from fastapi import Depends, HTTPException, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from ..agent.runner import ReconAgentRunner
from ..config import load_settings
from ..database import get_database
from ..tasks import get_task_manager
from ..repositories.target_repo import TargetRepository
from ..repositories.session_repo import SessionRepository
from ..repositories.host_repo import HostRepository
from ..services.scan_service import ScanService

settings = load_settings()
db = get_database(settings.database_url)

security = HTTPBearer(auto_error=False)


async def verify_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
):
    if not settings.server_api_key:
        if settings.allow_insecure_dev_auth:
            return True
        raise HTTPException(status_code=503, detail="API auth is not configured")
    if credentials is None or credentials.credentials != settings.server_api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return True


async def get_current_user(
    x_user_id: int | None = Header(None, alias="X-User-Id"),
) -> int:
    """Resolve the current user ID from header or default."""
    return x_user_id or 1


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with db.get_session() as session:
        yield session


def get_target_repo(
    session: AsyncSession = Depends(get_db_session),
    user_id: int = Depends(get_current_user),
) -> TargetRepository:
    return TargetRepository(session, user_id=user_id)


def get_session_repo(
    session: AsyncSession = Depends(get_db_session),
) -> SessionRepository:
    return SessionRepository(session)


def get_host_repo(session: AsyncSession = Depends(get_db_session)) -> HostRepository:
    return HostRepository(session)


def get_tm():
    return get_task_manager(settings.redis_url, settings.model_dump(mode='json'))


def get_agent_runner() -> ReconAgentRunner:
    return ReconAgentRunner(settings=settings)


def get_scan_service(
    session: AsyncSession = Depends(get_db_session),
    tm=Depends(get_tm),
    user_id: int = Depends(get_current_user),
) -> ScanService:
    target_repo = TargetRepository(session, user_id=user_id)
    session_repo = SessionRepository(session)
    return ScanService(settings, session, tm, target_repo, session_repo)
