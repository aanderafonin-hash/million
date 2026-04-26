"""TheSportsDB free API client for upcoming events.

Uses the public dev key "3" which the maintainer keeps live for free use.
We pick a few popular leagues and ingest their upcoming events as bettable
markets. Outcomes are: home win / draw / away win — for soccer/basketball
markets we simulate ~typical probability split based on team strength
(falls back to roughly 0.45/0.27/0.28 if we have no extra info).

Doc: https://www.thesportsdb.com/free_sports_api
"""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Optional

import httpx
from sqlmodel import Session, select

from ..config import settings
from ..models import Event, Outcome
from ..services.odds import normalize_probabilities, prob_to_odds

logger = logging.getLogger(__name__)

# A small curated list of leagues (sports + league id pairs)
LEAGUES = [
    ("Soccer", 4328, "⚽ EPL"),  # English Premier League
    ("Soccer", 4335, "⚽ La Liga"),  # Spanish La Liga
    ("Basketball", 4387, "🏀 NBA"),
    ("Ice Hockey", 4380, "🏒 NHL"),
    ("Soccer", 4332, "⚽ MLS"),
]


def _outcomes_for_event(sport: str) -> list[tuple[str, float]]:
    """Default outcome split for a given sport."""
    if sport.lower() == "soccer":
        return [("П1", 0.45), ("Х", 0.27), ("П2", 0.28)]
    # most other sports are 2-way
    return [("П1", 0.55), ("П2", 0.45)]


async def _fetch_league_next(client: httpx.AsyncClient, league_id: int) -> List[dict]:
    url = f"https://www.thesportsdb.com/api/v1/json/{settings.sportsdb_key}/eventsnextleague.php?id={league_id}"
    try:
        r = await client.get(url, timeout=15.0)
        r.raise_for_status()
        data = r.json()
        return data.get("events") or []
    except Exception as e:
        logger.warning("sportsdb fetch failed for league %s: %s", league_id, e)
        return []


async def fetch_upcoming() -> List[dict]:
    """Return a list of normalized upcoming match dicts."""
    out: List[dict] = []
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *[_fetch_league_next(client, lid) for _, lid, _ in LEAGUES]
        )
    for (sport, _lid, league_label), evs in zip(LEAGUES, results):
        for e in evs[:8]:  # cap per league
            home = e.get("strHomeTeam") or "Home"
            away = e.get("strAwayTeam") or "Away"
            ts_str = e.get("strTimestamp")
            try:
                starts_at = (
                    datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                    if ts_str
                    else None
                )
            except Exception:
                starts_at = None
            ext_id = f"sportsdb:{e.get('idEvent')}"
            out.append(
                {
                    "ext_id": ext_id,
                    "sport": sport,
                    "league": league_label,
                    "home": home,
                    "away": away,
                    "starts_at": starts_at,
                    "raw_event_id": e.get("idEvent"),
                }
            )
    return out


def _emoji_for(sport: str) -> str:
    return {
        "soccer": "⚽",
        "basketball": "🏀",
        "ice hockey": "🏒",
    }.get(sport.lower(), "🏆")


def upsert_sports_events(session: Session, fetched: List[dict]) -> int:
    """Insert any sports events that are not yet in the DB. Returns count added."""
    added = 0
    for f in fetched:
        existing = session.exec(
            select(Event).where(Event.source == "sportsdb", Event.source_ref == f["ext_id"])
        ).first()
        if existing:
            continue
        outcomes = _outcomes_for_event(f["sport"])
        probs = normalize_probabilities([p for _, p in outcomes])
        starts_at: Optional[datetime] = f.get("starts_at")
        # Resolve ~3 hours after kickoff (covers most matches)
        resolves_at = starts_at + timedelta(hours=3) if starts_at else None
        event = Event(
            owner_id=None,
            title=f"{f['home']} — {f['away']}",
            description=f"{f['league']} · {f['sport']}",
            category="sport",
            emoji=_emoji_for(f["sport"]),
            color1="#1f7a3a",
            color2="#0e3b21",
            source="sportsdb",
            source_ref=f["ext_id"],
            starts_at=starts_at,
            resolves_at=resolves_at,
        )
        session.add(event)
        session.commit()
        session.refresh(event)
        for i, ((label, _orig_p), p_norm) in enumerate(zip(outcomes, probs)):
            session.add(
                Outcome(
                    event_id=event.id,
                    idx=i,
                    label=label,
                    probability=p_norm,
                    odds=prob_to_odds(p_norm),
                )
            )
        session.commit()
        added += 1
    return added


async def fetch_finished_event_score(client: httpx.AsyncClient, raw_event_id: str) -> Optional[dict]:
    url = f"https://www.thesportsdb.com/api/v1/json/{settings.sportsdb_key}/lookupevent.php?id={raw_event_id}"
    try:
        r = await client.get(url, timeout=15.0)
        r.raise_for_status()
        data = r.json()
        events = data.get("events") or []
        if not events:
            return None
        return events[0]
    except Exception as e:
        logger.warning("sportsdb lookup failed for %s: %s", raw_event_id, e)
        return None


def determine_sportsdb_outcome(event_dict: dict) -> Optional[int]:
    """Given the SportsDB event JSON, return outcome index (0=home,1=draw,2=away)."""
    home = event_dict.get("intHomeScore")
    away = event_dict.get("intAwayScore")
    if home is None or away is None:
        return None
    try:
        home_i = int(home)
        away_i = int(away)
    except Exception:
        return None
    if home_i > away_i:
        return 0
    if home_i == away_i:
        return 1
    return 2
