from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..auth import get_current_user
from ..db import get_session
from ..models import Bet, BetLeg, Event, Outcome, Transaction, User
from ..schemas import BetCreateIn, BetOut
from ..services.bets_service import resolve_event, serialize_bet

router = APIRouter(prefix="/api/bets", tags=["bets"])


@router.post("", response_model=BetOut)
def place_bet(
    payload: BetCreateIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> BetOut:
    if not payload.legs:
        raise HTTPException(status_code=400, detail="empty bet")
    if payload.stake < 10:
        raise HTTPException(status_code=400, detail="minimum stake is 10")
    if payload.stake > user.balance:
        raise HTTPException(status_code=400, detail="not enough balance")

    seen_events = set()
    legs_data = []
    total_odds = 1.0
    for leg in payload.legs:
        if leg.event_id in seen_events:
            raise HTTPException(status_code=400, detail="duplicate event in bet")
        seen_events.add(leg.event_id)
        event = session.exec(select(Event).where(Event.id == leg.event_id)).first()
        if not event:
            raise HTTPException(status_code=404, detail=f"event #{leg.event_id} not found")
        if event.resolved_outcome_index is not None:
            raise HTTPException(status_code=409, detail=f"event #{leg.event_id} already resolved")
        outcome = session.exec(
            select(Outcome).where(
                Outcome.event_id == event.id, Outcome.idx == leg.outcome_idx
            )
        ).first()
        if not outcome:
            raise HTTPException(status_code=404, detail="outcome not found")
        legs_data.append((event, outcome))
        total_odds *= outcome.odds

    total_odds = round(total_odds, 4)
    possible_win = round(payload.stake * total_odds, 2)

    bet = Bet(
        user_id=user.id,
        stake=payload.stake,
        total_odds=total_odds,
        possible_win=possible_win,
    )
    session.add(bet)
    session.commit()
    session.refresh(bet)

    for event, outcome in legs_data:
        leg = BetLeg(
            bet_id=bet.id,
            event_id=event.id,
            outcome_idx=outcome.idx,
            outcome_label=outcome.label,
            odds=outcome.odds,
        )
        session.add(leg)

    user.balance = round(user.balance - payload.stake, 2)
    session.add(user)
    session.add(
        Transaction(
            user_id=user.id,
            type="bet",
            amount=-payload.stake,
            balance_after=user.balance,
            bet_id=bet.id,
            note=f"Express ×{total_odds:.2f}",
        )
    )
    session.commit()

    # Resolve "fictional" events (user-created and seeded life events) right
    # away using their true probabilities. Real-world events (sportsdb /
    # weather) stay pending — the background resolver closes them when the
    # actual outcome is known.
    for event, _ in legs_data:
        if event.source not in ("sportsdb", "weather") and event.resolved_outcome_index is None:
            resolve_event(session, event)

    session.refresh(bet)
    return serialize_bet(session, bet)


@router.get("", response_model=List[BetOut])
def list_my_bets(
    status: str | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> List[BetOut]:
    stmt = select(Bet).where(Bet.user_id == user.id).order_by(Bet.created_at.desc())
    if status and status in ("pending", "won", "lost"):
        stmt = stmt.where(Bet.status == status)
    bets = session.exec(stmt).all()
    return [serialize_bet(session, b) for b in bets]


@router.get("/{bet_id}", response_model=BetOut)
def get_bet(
    bet_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> BetOut:
    bet = session.exec(select(Bet).where(Bet.id == bet_id, Bet.user_id == user.id)).first()
    if not bet:
        raise HTTPException(status_code=404, detail="bet not found")
    return serialize_bet(session, bet)
