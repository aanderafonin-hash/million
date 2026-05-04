"""Admin / moderator endpoints. Mounted under /api/admin.

Authorization rules:
- Anyone with is_moderator OR is_admin can: list users, list events, list chat,
  ban/unban (non-admin targets), mute users, delete events, delete chat msgs.
- Only is_admin can: change roles (grant/revoke moderator/admin), set balances
  arbitrarily, view full audit log, ban/unban admins.
"""
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from ..auth import require_admin, require_moderator
from ..db import get_session
from ..models import (
    AuditLog,
    Bet,
    BetLeg,
    ChatMessage,
    Event,
    Outcome,
    Stream,
    Transaction,
    User,
)
from ..schemas import (
    AdminAuditOut,
    AdminBalanceIn,
    AdminBanIn,
    AdminMuteIn,
    AdminRoleIn,
    AdminUserOut,
    ChatMessageOut,
    EventOut,
)
from ..services.events_repo import serialize_event

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _audit(
    session: Session,
    actor_id: int,
    action: str,
    *,
    target_user_id: Optional[int] = None,
    target_event_id: Optional[int] = None,
    target_chat_msg_id: Optional[int] = None,
    note: Optional[str] = None,
) -> None:
    session.add(
        AuditLog(
            actor_user_id=actor_id,
            action=action,
            target_user_id=target_user_id,
            target_event_id=target_event_id,
            target_chat_msg_id=target_chat_msg_id,
            note=note,
        )
    )
    session.commit()


def _user_to_admin_out(session: Session, u: User) -> AdminUserOut:
    bets_count = session.exec(
        select(func.count(Bet.id)).where(Bet.user_id == u.id)
    ).one()
    events_count = session.exec(
        select(func.count(Event.id)).where(Event.owner_id == u.id)
    ).one()
    return AdminUserOut(
        id=u.id,
        username=u.username,
        email=u.email,
        avatar=u.avatar,
        avatar_url=u.avatar_url,
        balance=u.balance,
        is_admin=bool(u.is_admin),
        is_moderator=bool(u.is_moderator),
        is_banned=bool(u.is_banned),
        ban_reason=u.ban_reason,
        chat_muted_until=u.chat_muted_until,
        created_at=u.created_at,
        bets_count=int(bets_count or 0),
        events_count=int(events_count or 0),
    )


@router.get("/users", response_model=List[AdminUserOut])
def list_users(
    q: Optional[str] = None,
    session: Session = Depends(get_session),
    _mod: User = Depends(require_moderator),
) -> List[AdminUserOut]:
    stmt = select(User)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(User.username.ilike(like))
    stmt = stmt.order_by(User.created_at.desc())
    users = session.exec(stmt).all()
    return [_user_to_admin_out(session, u) for u in users]


@router.post("/users/{user_id}/ban", response_model=AdminUserOut)
def ban_user(
    user_id: int,
    payload: AdminBanIn,
    session: Session = Depends(get_session),
    mod: User = Depends(require_moderator),
) -> AdminUserOut:
    target = session.exec(select(User).where(User.id == user_id)).first()
    if not target:
        raise HTTPException(status_code=404, detail="user not found")
    if target.is_admin and not mod.is_admin:
        raise HTTPException(status_code=403, detail="cannot ban admin")
    if target.id == mod.id:
        raise HTTPException(status_code=400, detail="cannot ban self")
    target.is_banned = bool(payload.banned)
    target.ban_reason = payload.reason if payload.banned else None
    session.add(target)
    session.commit()
    session.refresh(target)
    _audit(
        session,
        mod.id,
        "ban_user" if payload.banned else "unban_user",
        target_user_id=target.id,
        note=payload.reason,
    )
    return _user_to_admin_out(session, target)


@router.post("/users/{user_id}/mute", response_model=AdminUserOut)
def mute_user(
    user_id: int,
    payload: AdminMuteIn,
    session: Session = Depends(get_session),
    mod: User = Depends(require_moderator),
) -> AdminUserOut:
    target = session.exec(select(User).where(User.id == user_id)).first()
    if not target:
        raise HTTPException(status_code=404, detail="user not found")
    if target.is_admin and not mod.is_admin:
        raise HTTPException(status_code=403, detail="cannot mute admin")
    if payload.minutes <= 0:
        target.chat_muted_until = None
    else:
        target.chat_muted_until = datetime.utcnow() + timedelta(minutes=payload.minutes)
    session.add(target)
    session.commit()
    session.refresh(target)
    _audit(
        session,
        mod.id,
        "mute_user" if payload.minutes > 0 else "unmute_user",
        target_user_id=target.id,
        note=str(payload.minutes),
    )
    return _user_to_admin_out(session, target)


@router.post("/users/{user_id}/role", response_model=AdminUserOut)
def set_role(
    user_id: int,
    payload: AdminRoleIn,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
) -> AdminUserOut:
    target = session.exec(select(User).where(User.id == user_id)).first()
    if not target:
        raise HTTPException(status_code=404, detail="user not found")
    if payload.is_moderator is not None:
        target.is_moderator = bool(payload.is_moderator)
    if payload.is_admin is not None:
        if target.id == admin.id and not payload.is_admin:
            raise HTTPException(status_code=400, detail="cannot revoke own admin")
        target.is_admin = bool(payload.is_admin)
        if target.is_admin:
            target.is_moderator = True
    session.add(target)
    session.commit()
    session.refresh(target)
    _audit(
        session,
        admin.id,
        "set_role",
        target_user_id=target.id,
        note=f"mod={target.is_moderator},admin={target.is_admin}",
    )
    return _user_to_admin_out(session, target)


@router.post("/users/{user_id}/balance", response_model=AdminUserOut)
def set_balance(
    user_id: int,
    payload: AdminBalanceIn,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
) -> AdminUserOut:
    target = session.exec(select(User).where(User.id == user_id)).first()
    if not target:
        raise HTTPException(status_code=404, detail="user not found")
    delta = payload.balance - target.balance
    target.balance = float(payload.balance)
    session.add(target)
    session.add(
        Transaction(
            user_id=target.id,
            type="admin",
            amount=delta,
            balance_after=target.balance,
            note=payload.note or "admin set_balance",
        )
    )
    session.commit()
    session.refresh(target)
    _audit(
        session,
        admin.id,
        "set_balance",
        target_user_id=target.id,
        note=f"to={target.balance}",
    )
    return _user_to_admin_out(session, target)


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
) -> dict:
    target = session.exec(select(User).where(User.id == user_id)).first()
    if not target:
        raise HTTPException(status_code=404, detail="user not found")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="cannot delete self")
    if target.is_admin:
        raise HTTPException(status_code=400, detail="cannot delete admin")

    # Soft delete: ban + scrub username/email so it can be re-registered.
    target.is_banned = True
    target.ban_reason = (target.ban_reason or "") + " [deleted]"
    target.username = f"deleted_{target.id}"
    target.email = None
    target.recovery_code_hash = None
    session.add(target)
    session.commit()
    _audit(session, admin.id, "delete_user", target_user_id=target.id)
    return {"ok": True}


@router.get("/events", response_model=List[EventOut])
def admin_list_events(
    q: Optional[str] = None,
    show_resolved: bool = True,
    session: Session = Depends(get_session),
    _mod: User = Depends(require_moderator),
) -> List[EventOut]:
    stmt = select(Event)
    if not show_resolved:
        stmt = stmt.where(Event.resolved_outcome_index == None)  # noqa: E711
    if q:
        stmt = stmt.where(Event.title.ilike(f"%{q.lower()}%"))
    stmt = stmt.order_by(Event.created_at.desc())
    events = session.exec(stmt).all()
    return [serialize_event(session, e) for e in events]


@router.delete("/events/{event_id}")
def admin_delete_event(
    event_id: int,
    session: Session = Depends(get_session),
    mod: User = Depends(require_moderator),
) -> dict:
    event = session.exec(select(Event).where(Event.id == event_id)).first()
    if not event:
        raise HTTPException(status_code=404, detail="event not found")

    # Refund any open bet legs that touch this event so users don't lose money.
    legs = session.exec(select(BetLeg).where(BetLeg.event_id == event.id)).all()
    bet_ids = {leg.bet_id for leg in legs}
    for bet_id in bet_ids:
        bet = session.exec(select(Bet).where(Bet.id == bet_id)).first()
        if not bet or bet.status != "pending":
            continue
        user = session.exec(select(User).where(User.id == bet.user_id)).first()
        if user:
            user.balance += bet.stake
            session.add(user)
            session.add(
                Transaction(
                    user_id=user.id,
                    type="refund",
                    amount=bet.stake,
                    balance_after=user.balance,
                    bet_id=bet.id,
                    note=f"admin removed event #{event.id}",
                )
            )
        bet.status = "lost"  # closed
        bet.payout = 0.0
        bet.resolved_at = datetime.utcnow()
        session.add(bet)

    # Now remove related rows.
    for o in session.exec(select(Outcome).where(Outcome.event_id == event.id)).all():
        session.delete(o)
    for s in session.exec(select(Stream).where(Stream.event_id == event.id)).all():
        session.delete(s)
    for c in session.exec(select(ChatMessage).where(ChatMessage.event_id == event.id)).all():
        session.delete(c)
    session.delete(event)
    session.commit()
    _audit(session, mod.id, "delete_event", target_event_id=event_id)
    return {"ok": True}


@router.get("/chat", response_model=List[ChatMessageOut])
def admin_list_chat(
    event_id: Optional[int] = None,
    limit: int = 200,
    session: Session = Depends(get_session),
    _mod: User = Depends(require_moderator),
) -> List[ChatMessageOut]:
    stmt = select(ChatMessage)
    if event_id is not None:
        stmt = stmt.where(ChatMessage.event_id == event_id)
    stmt = stmt.order_by(ChatMessage.created_at.desc()).limit(limit)
    msgs = list(reversed(session.exec(stmt).all()))
    out: List[ChatMessageOut] = []
    for m in msgs:
        u = session.exec(select(User).where(User.id == m.user_id)).first()
        out.append(
            ChatMessageOut(
                id=m.id,
                event_id=m.event_id,
                user_id=m.user_id,
                username=u.username if u else "?",
                avatar=u.avatar if u else "🦊",
                avatar_url=u.avatar_url if u else None,
                text=m.text,
                is_deleted=bool(m.is_deleted),
                created_at=m.created_at,
            )
        )
    return out


@router.delete("/chat/{msg_id}")
def admin_delete_chat(
    msg_id: int,
    session: Session = Depends(get_session),
    mod: User = Depends(require_moderator),
) -> dict:
    m = session.exec(select(ChatMessage).where(ChatMessage.id == msg_id)).first()
    if not m:
        raise HTTPException(status_code=404, detail="message not found")
    m.is_deleted = True
    m.text = "[deleted]"
    session.add(m)
    session.commit()
    _audit(session, mod.id, "delete_chat", target_chat_msg_id=msg_id)
    return {"ok": True}


@router.get("/audit", response_model=List[AdminAuditOut])
def list_audit(
    limit: int = 200,
    session: Session = Depends(get_session),
    _admin: User = Depends(require_admin),
) -> List[AdminAuditOut]:
    rows = session.exec(
        select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    ).all()
    out: List[AdminAuditOut] = []
    for r in rows:
        actor = session.exec(select(User).where(User.id == r.actor_user_id)).first()
        out.append(
            AdminAuditOut(
                id=r.id,
                actor_user_id=r.actor_user_id,
                actor_username=actor.username if actor else None,
                action=r.action,
                target_user_id=r.target_user_id,
                target_event_id=r.target_event_id,
                target_chat_msg_id=r.target_chat_msg_id,
                note=r.note,
                created_at=r.created_at,
            )
        )
    return out
