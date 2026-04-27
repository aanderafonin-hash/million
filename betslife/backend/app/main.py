import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import init_db, session_scope
from .routers.admin_router import router as admin_router
from .routers.auth_router import router as auth_router
from .routers.bets_router import router as bets_router
from .routers.chat_router import router as chat_router
from .routers.events_router import router as events_router
from .routers.payments_router import router as payments_router
from .routers.streams_router import router as streams_router
from .routers.uploads_router import router as uploads_router
from .services.resolver import background_loop
from .services.seed import seed_if_empty

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("betslife")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    init_db()
    with session_scope() as session:
        added = seed_if_empty(session)
        if added:
            logger.info("seeded %d default events", added)
    task = asyncio.create_task(background_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass


app = FastAPI(title=settings.site_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(events_router)
app.include_router(bets_router)
app.include_router(payments_router)
app.include_router(streams_router)
app.include_router(chat_router)
app.include_router(uploads_router)
app.include_router(admin_router)

# Static uploads (avatars, stream media)
os.makedirs(settings.uploads_dir, exist_ok=True)
os.makedirs(os.path.join(settings.uploads_dir, "avatars"), exist_ok=True)
os.makedirs(os.path.join(settings.uploads_dir, "streams"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.uploads_dir), name="uploads")


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "service": settings.site_name}


@app.get("/")
def root() -> JSONResponse:
    return JSONResponse(
        {
            "service": settings.site_name,
            "docs": "/docs",
            "health": "/api/health",
        }
    )
