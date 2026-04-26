from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.utcnow()


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    password_hash: str
    avatar: str = "🦊"
    balance: float = 10000.0
    recovery_code_hash: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


class Event(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    owner_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    title: str
    description: str = ""
    category: str = "mine"  # life|sport|weird|office|home|mine|weather
    emoji: str = "🎯"
    color1: str = "#ff7a18"
    color2: str = "#3a8dff"
    image_data_url: Optional[str] = None
    source: str = "user"  # user|sportsdb|weather
    source_ref: Optional[str] = None  # external id, e.g. sportsdb event id
    starts_at: Optional[datetime] = None
    resolves_at: Optional[datetime] = None
    resolved_outcome_index: Optional[int] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)


class Outcome(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    event_id: int = Field(foreign_key="event.id", index=True)
    idx: int
    label: str
    probability: float  # 0..1, sum across outcomes for an event must be ~1
    odds: float  # cached: 1 / (p * (1 - margin))


class Bet(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    stake: float
    total_odds: float
    possible_win: float
    status: str = "pending"  # pending|won|lost
    payout: float = 0.0
    created_at: datetime = Field(default_factory=utcnow)
    resolved_at: Optional[datetime] = None


class BetLeg(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    bet_id: int = Field(foreign_key="bet.id", index=True)
    event_id: int = Field(foreign_key="event.id", index=True)
    outcome_idx: int
    outcome_label: str
    odds: float
    status: str = "pending"  # pending|won|lost


class Transaction(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    type: str  # topup|withdraw|bet|win|refund
    amount: float
    balance_after: float
    bet_id: Optional[int] = Field(default=None, foreign_key="bet.id")
    note: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


class Stream(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    event_id: int = Field(foreign_key="event.id", unique=True, index=True)
    owner_id: int = Field(foreign_key="user.id")
    url: Optional[str] = None
    started_at: datetime = Field(default_factory=utcnow)
    is_live: bool = True


class ChatMessage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    event_id: int = Field(foreign_key="event.id", index=True)
    user_id: int = Field(foreign_key="user.id")
    text: str
    created_at: datetime = Field(default_factory=utcnow)
