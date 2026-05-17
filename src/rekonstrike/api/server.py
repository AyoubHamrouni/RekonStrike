import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from rekonstrike.config import load_settings
from rekonstrike.database import get_database
from rekonstrike.tasks import get_task_manager
from rekonstrike.api.routers.agent import router as agent_router

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
    allow_origins=["http://localhost:3000"],
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

# Routers
app.include_router(agent_router, prefix="/api/v1")
