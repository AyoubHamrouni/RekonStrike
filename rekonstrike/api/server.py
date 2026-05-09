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

app = FastAPI(
    title="RekonStrike API",
    version=__version__,
    docs_url="/docs",
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
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

# ─── Routers ──────────────────────────────────────────────────────────────────

app.include_router(scans.router)
app.include_router(targets.router)

# ─── Events ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    from alembic.config import Config as AlembicConfig
    from alembic import command as alembic_cmd
    ini_path = os.path.join(os.path.dirname(__file__), "..", "..", "alembic.ini")
    if os.path.exists(ini_path):
        alembic_cfg = AlembicConfig(ini_path)
        alembic_cmd.upgrade(alembic_cfg, "head")
    else:
        await db.create_all()
    
    tm = get_task_manager()
    await tm.start()

    try:
        await ensure_wordlists(settings.data_dir)
    except Exception as e:
        logger.warning("Wordlist download failed: %s", e)


@app.on_event("shutdown")
async def shutdown():
    tm = get_task_manager()
    await tm.close()
    await db.close()


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "version": __version__, "python": "3.14+"}
