"""Open-Meteo weather integration (no API key required).

We seed a few "Will it rain tomorrow in <city>?" markets and resolve them
based on the actual rainfall the next day.

Doc: https://open-meteo.com/en/docs
"""
import asyncio
import logging
from datetime import date, datetime, timedelta
from typing import List, Optional

import httpx
from sqlmodel import Session, select

from ..models import Event, Outcome
from ..services.odds import normalize_probabilities, prob_to_odds

logger = logging.getLogger(__name__)


CITIES = [
    {"name": "Москва", "lat": 55.7558, "lon": 37.6173, "tz": "Europe/Moscow"},
    {"name": "Санкт-Петербург", "lat": 59.9343, "lon": 30.3351, "tz": "Europe/Moscow"},
    {"name": "London", "lat": 51.5074, "lon": -0.1278, "tz": "Europe/London"},
    {"name": "New York", "lat": 40.7128, "lon": -74.0060, "tz": "America/New_York"},
    {"name": "Tokyo", "lat": 35.6762, "lon": 139.6503, "tz": "Asia/Tokyo"},
]


async def _forecast(client: httpx.AsyncClient, city: dict) -> Optional[dict]:
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={city['lat']}&longitude={city['lon']}"
        f"&daily=precipitation_sum,precipitation_probability_mean"
        f"&timezone={city['tz']}&forecast_days=2"
    )
    try:
        r = await client.get(url, timeout=15.0)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning("open-meteo failed for %s: %s", city["name"], e)
        return None


async def fetch_tomorrow_rain() -> List[dict]:
    out: List[dict] = []
    async with httpx.AsyncClient() as client:
        forecasts = await asyncio.gather(*[_forecast(client, c) for c in CITIES])
    for city, fc in zip(CITIES, forecasts):
        if not fc or "daily" not in fc:
            continue
        daily = fc["daily"]
        days = daily.get("time") or []
        prob_means = daily.get("precipitation_probability_mean") or []
        if len(days) < 2 or len(prob_means) < 2:
            continue
        tomorrow = days[1]
        prob_pct = prob_means[1]
        if prob_pct is None:
            continue
        prob = max(0.05, min(0.95, float(prob_pct) / 100.0))
        ext_id = f"weather:rain:{city['name']}:{tomorrow}"
        out.append(
            {
                "ext_id": ext_id,
                "city": city["name"],
                "date": tomorrow,
                "prob_rain": prob,
                "lat": city["lat"],
                "lon": city["lon"],
                "tz": city["tz"],
            }
        )
    return out


def upsert_weather_events(session: Session, fetched: List[dict]) -> int:
    added = 0
    for f in fetched:
        existing = session.exec(
            select(Event).where(Event.source == "weather", Event.source_ref == f["ext_id"])
        ).first()
        if existing:
            continue
        try:
            day = datetime.fromisoformat(f["date"])
        except Exception:
            day = datetime.utcnow() + timedelta(days=1)
        # resolves at end of the day
        resolves_at = day.replace(hour=23, minute=59, second=0)
        probs = normalize_probabilities([f["prob_rain"], 1.0 - f["prob_rain"]])
        event = Event(
            owner_id=None,
            title=f"☔ Пойдёт ли дождь завтра в {f['city']}?",
            description=f"Open-Meteo прогноз на {f['date']}. Авторесолв в конце дня.",
            category="weather",
            emoji="☔",
            color1="#3a8dff",
            color2="#1f4ea8",
            source="weather",
            source_ref=f["ext_id"],
            starts_at=day,
            resolves_at=resolves_at,
        )
        session.add(event)
        session.commit()
        session.refresh(event)
        for i, (label, p) in enumerate(zip(["Да, дождь", "Нет, сухо"], probs)):
            session.add(
                Outcome(
                    event_id=event.id,
                    idx=i,
                    label=label,
                    probability=p,
                    odds=prob_to_odds(p),
                )
            )
        session.commit()
        added += 1
    return added


async def fetch_actual_precipitation(
    client: httpx.AsyncClient, lat: float, lon: float, day_iso: str, tz: str
) -> Optional[float]:
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        "&daily=precipitation_sum"
        f"&timezone={tz}"
        f"&start_date={day_iso}&end_date={day_iso}"
        "&past_days=7"
    )
    try:
        r = await client.get(url, timeout=15.0)
        r.raise_for_status()
        data = r.json()
        d = data.get("daily") or {}
        sums = d.get("precipitation_sum") or []
        if not sums:
            return None
        return float(sums[0])
    except Exception as e:
        logger.warning("weather lookup failed: %s", e)
        return None


def determine_weather_outcome(precip_mm: float) -> int:
    """Return outcome index (0=rain, 1=dry). Threshold: 0.5 mm."""
    return 0 if precip_mm >= 0.5 else 1
