from fastapi import Depends, HTTPException
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


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with db.get_session() as session:
        yield session


def get_target_repo(
    session: AsyncSession = Depends(get_db_session),
) -> TargetRepository:
    return TargetRepository(session)


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
) -> ScanService:
    # ScanService will now take repositories instead of the Database wrapper
    target_repo = TargetRepository(session)
    session_repo = SessionRepository(session)
    return ScanService(settings, session, tm, target_repo, session_repo)
