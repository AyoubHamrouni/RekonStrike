import logging
import os
from pathlib import Path

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .. import __version__
from .deps import settings, db, get_task_manager, verify_auth
from .routers import scans, targets
from ..wordlists import ensure_wordlists

logger = logging.getLogger(__name__)

from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    from alembic.config import Config as AlembicConfig
    from alembic import command as alembic_cmd

    ini_path = os.path.join(os.path.dirname(__file__), "..", "..", "alembic.ini")

    # Run migrations
    if os.path.exists(ini_path):
        logger.info("Running database migrations...")
        alembic_cfg = AlembicConfig(ini_path)
        # Alembic is primarily sync, but since this is startup it's usually acceptable.
        # For a truly async approach, we'd use an async migration runner, but this is the standard way.
        alembic_cmd.upgrade(alembic_cfg, "head")
    else:
        logger.info("Alembic config not found, creating tables directly...")
        await db.create_all()

    tm = get_task_manager()
    await tm.start()

    try:
        await ensure_wordlists(settings.data_dir)
    except Exception as e:
        logger.warning("Wordlist download failed: %s", e)

    yield

    # Shutdown
    tm = get_task_manager()
    await tm.close()
    await db.close()


app = FastAPI(
    title="RekonStrike API",
    version=__version__,
    docs_url="/docs",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Static Files ─────────────────────────────────────────────────────────────

STATIC_DIR = Path(__file__).parent.parent.parent / "ui" / "dist"
if STATIC_DIR.exists():
    app.mount(
        "/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets"
    )

# ─── Routers ──────────────────────────────────────────────────────────────────

app.include_router(scans.router)
app.include_router(targets.router)


# ─── Routes ───────────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    return {"status": "ok", "version": __version__, "python": "3.14+"}
