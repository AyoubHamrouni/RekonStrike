import logging
import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from rekonstrike.config import load_settings
from rekonstrike.database import Database
from rekonstrike.api.routers.agent import router as agent_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize components
settings = load_settings()
db = Database(settings.database_url)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Database migration on startup
    try:
        from alembic.config import Config
        from alembic import command
        # Locate alembic.ini (assuming it's in the project root)
        ini_path = "alembic.ini"
        if os.path.exists(ini_path):
            alembic_cfg = Config(ini_path)
            # Run upgrade head in a separate thread to avoid blocking the loop
            # and to allow env.py to use asyncio.run()
            await asyncio.to_thread(command.upgrade, alembic_cfg, "head")
            logger.info("Alembic migrations completed.")
        else:
            logger.info("alembic.ini not found, creating tables directly.")
            await db.create_all()
    except Exception as e:
        logger.error(f"Migration error: {e}. Falling back to create_all.")
        await db.create_all()
    
    yield
    
    # Cleanup
    await db.close()

app = FastAPI(title="RekonStrike Backend", lifespan=lifespan)

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
