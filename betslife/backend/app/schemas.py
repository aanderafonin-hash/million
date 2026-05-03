from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


class CaptchaIssueOut(BaseModel):
    token: str
    question: str


class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=24)
    password: str = Field(min_length=4, max_length=80)
    email: Optional[EmailStr] = None
    avatar: str = "🦊"
    captcha_token: str = Field(min_length=1)
    captcha_answer: str = Field(min_length=1, max_length=20)


class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    avatar: str
    avatar_url: Optional[str] = None
    balance: float
    created_at: datetime
    is_admin: bool = False
    is_moderator: bool = False
    is_banned: bool = False
    chat_muted_until: Optional[datetime] = None
    recovery_code: Optional[str] = None  # only sent right after registration

    class Config:
        from_attributes = True


class RecoveryRequestIn(BaseModel):
    username: str


class RecoveryConfirmIn(BaseModel):
    username: str
    recovery_code: str
    new_password: str = Field(min_length=4, max_length=80)


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=4, max_length=80)


class UpdateProfileIn(BaseModel):
    avatar: Optional[str] = None
    email: Optional[EmailStr] = None


class OutcomeIn(BaseModel):
    label: str
    probability: float = Field(gt=0.0, lt=1.0)


class OutcomeOut(BaseModel):
    idx: int
    label: str
    probability: float
    odds: float

    class Config:
        from_attributes = True


class EventCreateIn(BaseModel):
    title: str = Field(min_length=2, max_length=140)
    description: str = ""
    category: str = "mine"
    emoji: str = "🎯"
    color1: str = "#ff7a18"
    color2: str = "#3a8dff"
    image_data_url: Optional[str] = None
    outcomes: List[OutcomeIn]


class EventOut(BaseModel):
    id: int
    owner_id: Optional[int]
    owner_username: Optional[str]
    owner_avatar: Optional[str]
    title: str
    description: str
    category: str
    emoji: str
    color1: str
    color2: str
    image_data_url: Optional[str]
    source: str
    starts_at: Optional[datetime]
    resolves_at: Optional[datetime]
    resolved_outcome_index: Optional[int]
    outcomes: List[OutcomeOut]
    is_live: bool
    viewers: int = 0
    volume: float = 0.0


class BetLegIn(BaseModel):
    event_id: int
    outcome_idx: int


class BetCreateIn(BaseModel):
    legs: List[BetLegIn]
    stake: float = Field(gt=0)


class BetLegOut(BaseModel):
    event_id: int
    event_title: str
    outcome_idx: int
    outcome_label: str
    odds: float
    status: str
    resolved_outcome_index: Optional[int] = None
    resolved_outcome_label: Optional[str] = None


class BetOut(BaseModel):
    id: int
    stake: float
    total_odds: float
    possible_win: float
    status: str
    payout: float
    created_at: datetime
    resolved_at: Optional[datetime]
    legs: List[BetLegOut]


class TopUpIn(BaseModel):
    amount: float = Field(gt=0)


class WithdrawIn(BaseModel):
    amount: float = Field(gt=0)


class TransactionOut(BaseModel):
    id: int
    type: str
    amount: float
    balance_after: float
    note: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class StreamStartIn(BaseModel):
    url: Optional[str] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = None  # mp4|hls|youtube|twitch|placeholder


class StreamOut(BaseModel):
    event_id: int
    owner_id: int
    owner_username: str
    url: Optional[str]
    media_url: Optional[str] = None
    media_type: Optional[str] = None
    started_at: datetime
    is_live: bool
    viewers: int


class ChatMessageOut(BaseModel):
    id: int
    event_id: int
    user_id: int
    username: str
    avatar: str
    avatar_url: Optional[str] = None
    text: str
    is_deleted: bool = False
    created_at: datetime


class ChatMessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class ExportOut(BaseModel):
    user: UserOut
    transactions: List[TransactionOut]
    bets: List[BetOut]


# ------- Admin / moderation -------


class AdminUserOut(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    avatar: str
    avatar_url: Optional[str] = None
    balance: float
    is_admin: bool
    is_moderator: bool
    is_banned: bool
    ban_reason: Optional[str] = None
    chat_muted_until: Optional[datetime] = None
    created_at: datetime
    bets_count: int = 0
    events_count: int = 0


class AdminBanIn(BaseModel):
    banned: bool
    reason: Optional[str] = None


class AdminMuteIn(BaseModel):
    minutes: int = Field(ge=0, le=24 * 60 * 30)  # up to ~30 days


class AdminRoleIn(BaseModel):
    is_moderator: Optional[bool] = None
    is_admin: Optional[bool] = None


class AdminBalanceIn(BaseModel):
    balance: float = Field(ge=0)
    note: Optional[str] = None


class AdminAuditOut(BaseModel):
    id: int
    actor_user_id: int
    actor_username: Optional[str] = None
    action: str
    target_user_id: Optional[int] = None
    target_event_id: Optional[int] = None
    target_chat_msg_id: Optional[int] = None
    note: Optional[str] = None
    created_at: datetime


TokenOut.model_rebuild()
