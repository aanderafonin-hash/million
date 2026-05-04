"""Leaderboard, public profiles and daily-bonus endpoints.

Daily bonus state is stored in the `kv_meta` table (key = `last_bonus_{user_id}`)
to avoid a schema migration for a single date field.
"""
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlmodel import Session, select

from ..auth import get_current_user
from ..db import get_session
from ..models import Bet, Event, Transaction, User


router = APIRouter(prefix="/api/social", tags=["social"])


# ---------- pydantic outputs ----------


class LeaderboardEntry(BaseModel):
    user_id: int
    username: str
    avatar: str
    avatar_url: Optional[str] = None
    balance: float
    profit: float
    bets_count: int
    won_count: int
    win_rate: float


class LeaderboardOut(BaseModel):
    period: str
    entries: List[LeaderboardEntry]


class PublicProfile(BaseModel):
    id: int
    username: str
    avatar: str
    avatar_url: Optional[str] = None
    created_at: datetime
    bets_count: int
    won_count: int
    lost_count: int
    pending_count: int
    win_rate: float
    profit: float
    events_created: int


class DailyBonusStatus(BaseModel):
    can_claim: bool
    next_claim_at: Optional[datetime]
    streak: int
    today_bonus: float


class DailyBonusClaim(BaseModel):
    granted: float
    new_balance: float
    streak: int
    next_claim_at: datetime


# ---------- helpers ----------


def _period_bounds(period: str) -> Optional[datetime]:
    now = datetime.utcnow()
    if period == "week":
        return now - timedelta(days=7)
    if period == "month":
        return now - timedelta(days=30)
    return None  # all-time


def _user_stats(session: Session, user_id: int, since: Optional[datetime] = None) -> dict:
    stmt = select(Bet).where(Bet.user_id == user_id)
    if since is not None:
        stmt = stmt.where(Bet.created_at >= since)
    bets = session.exec(stmt).all()
    total = len(bets)
    won = sum(1 for b in bets if b.status == "won")
    lost = sum(1 for b in bets if b.status == "lost")
    pending = sum(1 for b in bets if b.status == "pending")
    # profit: sum(payouts on won bets) - sum(stakes on lost bets). Pending is ignored.
    profit = 0.0
    for b in bets:
        if b.status == "won":
            profit += float(b.payout) - float(b.stake)
        elif b.status == "lost":
            profit -= float(b.stake)
    win_rate = 0.0 if (won + lost) == 0 else round(100.0 * won / (won + lost), 1)
    return {
        "bets_count": total,
        "won_count": won,
        "lost_count": lost,
        "pending_count": pending,
        "profit": round(profit, 2),
        "win_rate": win_rate,
    }


def _kv_get(session: Session, key: str) -> str:
    conn = session.connection()
    conn.execute(text("CREATE TABLE IF NOT EXISTS kv_meta (key TEXT PRIMARY KEY, value TEXT)"))
    row = conn.execute(
        text("SELECT value FROM kv_meta WHERE key=:k"), {"k": key}
    ).first()
    if not row:
        return ""
    return row[0] if isinstance(row, tuple) else str(row[0])


def _kv_set(session: Session, key: str, value: str) -> None:
    conn = session.connection()
    conn.execute(text("CREATE TABLE IF NOT EXISTS kv_meta (key TEXT PRIMARY KEY, value TEXT)"))
    conn.execute(
        text(
            "INSERT INTO kv_meta(key,value) VALUES(:k, :v) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value"
        ),
        {"k": key, "v": value},
    )
    session.commit()


def _bonus_amount_for_streak(streak: int) -> float:
    """Escalating daily login bonus (virtual ₽).

    Day 1: 50, Day 2: 75, ... Day 7: 200, Day 14: 400, Day 30+: 1000.
    """
    if streak <= 1:
        return 50.0
    if streak == 2:
        return 75.0
    if streak == 3:
        return 100.0
    if streak == 4:
        return 125.0
    if streak == 5:
        return 150.0
    if streak == 6:
        return 175.0
    if streak == 7:
        return 200.0
    if streak < 14:
        return 250.0
    if streak < 30:
        return 400.0
    return 1000.0


def _today_str() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d")


def _yesterday_str() -> str:
    return (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")


# ---------- endpoints ----------


@router.get("/leaderboard", response_model=LeaderboardOut)
def leaderboard(
    period: str = "all",
    limit: int = 20,
    session: Session = Depends(get_session),
) -> LeaderboardOut:
    """Top users by profit for the given period (week|month|all)."""
    since = _period_bounds(period)
    # take all users that have at least one bet to avoid scanning the whole table
    user_ids_with_bets = session.exec(
        select(Bet.user_id).distinct()
    ).all()
    entries: list[LeaderboardEntry] = []
    for uid_row in user_ids_with_bets:
        uid = uid_row if isinstance(uid_row, int) else uid_row[0]
        u = session.exec(select(User).where(User.id == uid)).first()
        if not u or u.is_banned:
            continue
        stats = _user_stats(session, uid, since=since)
        if stats["bets_count"] == 0:
            continue
        entries.append(
            LeaderboardEntry(
                user_id=u.id,
                username=u.username,
                avatar=u.avatar,
                avatar_url=u.avatar_url,
                balance=round(float(u.balance), 2),
                profit=stats["profit"],
                bets_count=stats["bets_count"],
                won_count=stats["won_count"],
                win_rate=stats["win_rate"],
            )
        )
    entries.sort(key=lambda e: e.profit, reverse=True)
    return LeaderboardOut(period=period, entries=entries[: max(1, min(limit, 100))])


@router.get("/profile/{username}", response_model=PublicProfile)
def public_profile(username: str, session: Session = Depends(get_session)) -> PublicProfile:
    u = session.exec(select(User).where(User.username == username)).first()
    if not u:
        raise HTTPException(status_code=404, detail="user not found")
    stats = _user_stats(session, u.id)
    events_count = session.exec(
        select(func.count(Event.id)).where(Event.owner_id == u.id)
    ).one()
    events_count = int(events_count or 0)
    return PublicProfile(
        id=u.id,
        username=u.username,
        avatar=u.avatar,
        avatar_url=u.avatar_url,
        created_at=u.created_at,
        bets_count=stats["bets_count"],
        won_count=stats["won_count"],
        lost_count=stats["lost_count"],
        pending_count=stats["pending_count"],
        win_rate=stats["win_rate"],
        profit=stats["profit"],
        events_created=events_count,
    )


@router.get("/bonus/status", response_model=DailyBonusStatus)
def bonus_status(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DailyBonusStatus:
    info = _kv_get(session, f"daily_bonus_{user.id}")
    last_date, streak = "", 0
    if info:
        parts = info.split("|")
        if len(parts) == 2:
            last_date = parts[0]
            try:
                streak = int(parts[1])
            except ValueError:
                streak = 0
    today = _today_str()
    can_claim = last_date != today
    # figure out today's streak number (if they claim now)
    if can_claim:
        next_streak = streak + 1 if last_date == _yesterday_str() else 1
    else:
        next_streak = streak
    bonus = _bonus_amount_for_streak(next_streak if can_claim else streak + 1)
    # next_claim_at: midnight UTC of the next day if already claimed
    now = datetime.utcnow()
    next_claim_at: Optional[datetime] = None
    if not can_claim:
        next_claim_at = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return DailyBonusStatus(
        can_claim=can_claim,
        next_claim_at=next_claim_at,
        streak=streak if not can_claim else next_streak - 1,
        today_bonus=bonus,
    )


@router.post("/bonus/claim", response_model=DailyBonusClaim)
def bonus_claim(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DailyBonusClaim:
    info = _kv_get(session, f"daily_bonus_{user.id}")
    last_date, streak = "", 0
    if info:
        parts = info.split("|")
        if len(parts) == 2:
            last_date = parts[0]
            try:
                streak = int(parts[1])
            except ValueError:
                streak = 0
    today = _today_str()
    if last_date == today:
        raise HTTPException(status_code=409, detail="already claimed today")
    new_streak = streak + 1 if last_date == _yesterday_str() else 1
    bonus = _bonus_amount_for_streak(new_streak)
    # grant bonus
    user.balance = round(float(user.balance) + bonus, 2)
    session.add(user)
    session.add(
        Transaction(
            user_id=user.id,
            type="bonus",
            amount=bonus,
            balance_after=user.balance,
            note=f"Daily bonus (day {new_streak})",
        )
    )
    session.commit()
    _kv_set(session, f"daily_bonus_{user.id}", f"{today}|{new_streak}")
    next_claim_at = (datetime.utcnow() + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return DailyBonusClaim(
        granted=bonus,
        new_balance=round(float(user.balance), 2),
        streak=new_streak,
        next_claim_at=next_claim_at,
    )
