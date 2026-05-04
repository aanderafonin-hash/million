"""Background task: pulls real sports + weather events, resolves expired ones."""
import asyncio
import logging
from datetime import datetime
from typing import Optional

import httpx
from sqlmodel import select

from ..config import settings
from ..db import session_scope
from ..models import Event
from ..services.bets_service import resolve_event
from ..services.sportsdb import (
    determine_sportsdb_outcome,
    fetch_finished_event_score,
    fetch_upcoming,
    upsert_sports_events,
)
from ..services.weather import (
    determine_weather_outcome,
    fetch_actual_precipitation,
    fetch_tomorrow_rain,
    upsert_weather_events,
)

logger = logging.getLogger(__name__)


async def ingest_external() -> None:
    try:
        sports = await fetch_upcoming()
    except Exception as e:
        logger.warning("ingest sports failed: %s", e)
        sports = []
    try:
        weather = await fetch_tomorrow_rain()
    except Exception as e:
        logger.warning("ingest weather failed: %s", e)
        weather = []

    with session_scope() as session:
        added_s = upsert_sports_events(session, sports)
        added_w = upsert_weather_events(session, weather)
    if added_s or added_w:
        logger.info("ingested events: %d sports, %d weather", added_s, added_w)


async def resolve_due() -> None:
    """Find events whose resolves_at is in the past and try to resolve them."""
    now = datetime.utcnow()
    with session_scope() as session:
        due = session.exec(
            select(Event)
            .where(Event.resolved_outcome_index == None)  # noqa: E711
            .where(Event.resolves_at != None)  # noqa: E711
            .where(Event.resolves_at <= now)
        ).all()

    if not due:
        return

    async with httpx.AsyncClient() as client:
        for ev in due:
            try:
                forced: Optional[int] = None
                if ev.source == "sportsdb" and ev.source_ref:
                    raw_id = ev.source_ref.split(":", 1)[-1]
                    data = await fetch_finished_event_score(client, raw_id)
                    if data:
                        forced = determine_sportsdb_outcome(data)
                elif ev.source == "weather" and ev.source_ref:
                    parts = ev.source_ref.split(":")
                    # weather:rain:<city>:<date>
                    if len(parts) >= 4:
                        day_iso = parts[3]
                        # find city info via title? simpler: re-fetch using saved coords by city name
                        from ..services.weather import CITIES
                        city = next((c for c in CITIES if c["name"] == parts[2]), None)
                        if city:
                            mm = await fetch_actual_precipitation(
                                client, city["lat"], city["lon"], day_iso, city["tz"]
                            )
                            if mm is not None:
                                forced = determine_weather_outcome(mm)
                with session_scope() as session:
                    fresh = session.exec(select(Event).where(Event.id == ev.id)).first()
                    if not fresh or fresh.resolved_outcome_index is not None:
                        continue
                    resolve_event(session, fresh, forced_idx=forced)
            except Exception as e:
                logger.exception("resolve failed for event %s: %s", ev.id, e)


async def background_loop() -> None:
    """Forever loop. Resolves due events every minute, ingests externals every 30 min."""
    INGEST_PERIOD = 30 * 60
    # Run an ingest immediately on startup so the catalogue isn't empty for half an hour.
    last_ingest: Optional[float] = None
    while True:
        try:
            now_ts = asyncio.get_event_loop().time()
            if last_ingest is None or (now_ts - last_ingest) > INGEST_PERIOD:
                logger.info("running external ingestion…")
                await ingest_external()
                last_ingest = asyncio.get_event_loop().time()
            await resolve_due()
        except Exception as e:
            logger.exception("background loop error: %s", e)
        await asyncio.sleep(settings.auto_resolve_interval_sec)
