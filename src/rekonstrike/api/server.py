import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from rekonstrike.config import load_settings
from rekonstrike.database import get_database
from rekonstrike.tasks import get_task_manager
from rekonstrike.phases import get_registered_phases
from rekonstrike.api.routers.agent import router as agent_router
from rekonstrike.api.routers.scans import router as scans_router
from rekonstrike.api.routers.targets import router as targets_router
from rekonstrike.api.routers.ai import router as ai_router
from rekonstrike.api.routers.threat_model import router as threat_model_router
from rekonstrike.api.routers.questioning import router as questioning_router
from rekonstrike.api.routers.testing import router as testing_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize components
settings = load_settings()
db = get_database(settings.database_url)
task_manager = get_task_manager(settings.redis_url, settings.model_dump(mode='json'))

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validate database connectivity on startup
    try:
        async with db.engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("Database connectivity validated.")
        await task_manager.start()
    except Exception as e:
        logger.error(f"Database connectivity failure: {e}")
        raise

    yield

    await task_manager.close()
    await db.close()

app = FastAPI(title="RekonStrike Backend", lifespan=lifespan)
app.state.settings = settings
app.state.db = db
app.state.task_manager = task_manager

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok"}

@app.get("/config")
async def get_config():
    """Returns configured providers (without keys)"""
    return {
        "providers": settings.configured_providers,
        "ai_provider": settings.ai_provider,
        "default_ai_model": settings.default_ai_model
    }

@app.get("/phases")
async def phases():
    return get_registered_phases()

# Routers
app.include_router(agent_router, prefix="/api/v1")
app.include_router(scans_router, prefix="/api/v1")
app.include_router(targets_router, prefix="/api/v1")
app.include_router(ai_router, prefix="/api/v1")
app.include_router(threat_model_router, prefix="/api/v1")
app.include_router(questioning_router, prefix="/api/v1")
app.include_router(testing_router, prefix="/api/v1")
