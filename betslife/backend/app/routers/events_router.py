from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..auth import get_current_user
from ..db import get_session
from ..models import Event, Outcome, Stream, User
from ..schemas import EventCreateIn, EventOut
from ..services.events_repo import serialize_event
from ..services.odds import normalize_probabilities, prob_to_odds
from ..services.viewers import all_counts

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=List[EventOut])
def list_events(
    category: Optional[str] = None,
    q: Optional[str] = None,
    show_resolved: bool = False,
    session: Session = Depends(get_session),
) -> List[EventOut]:
    stmt = select(Event)
    if not show_resolved:
        stmt = stmt.where(Event.resolved_outcome_index == None)  # noqa: E711
    if category and category != "all":
        stmt = stmt.where(Event.category == category)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(Event.title.ilike(like))
    stmt = stmt.order_by(Event.created_at.desc())
    events = session.exec(stmt).all()
    live_ids = {
        s.event_id
        for s in session.exec(select(Stream).where(Stream.is_live == True)).all()
    }
    counts = all_counts()
    return [serialize_event(session, e, viewer_counts=counts, live_event_ids=live_ids) for e in events]


@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: int, session: Session = Depends(get_session)) -> EventOut:
    event = session.exec(select(Event).where(Event.id == event_id)).first()
    if not event:
        raise HTTPException(status_code=404, detail="event not found")
    return serialize_event(session, event)


@router.post("", response_model=EventOut)
def create_event(
    payload: EventCreateIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> EventOut:
    if len(payload.outcomes) < 2:
        raise HTTPException(status_code=400, detail="need at least 2 outcomes")
    if len(payload.outcomes) > 8:
        raise HTTPException(status_code=400, detail="max 8 outcomes")

    probs = normalize_probabilities([o.probability for o in payload.outcomes])

    event = Event(
        owner_id=user.id,
        title=payload.title.strip(),
        description=payload.description.strip(),
        category=payload.category or "mine",
        emoji=payload.emoji or "🎯",
        color1=payload.color1,
        color2=payload.color2,
        image_data_url=payload.image_data_url,
        source="user",
    )
    session.add(event)
    session.commit()
    session.refresh(event)

    for i, (o_in, p_norm) in enumerate(zip(payload.outcomes, probs)):
        outcome = Outcome(
            event_id=event.id,
            idx=i,
            label=o_in.label.strip() or f"Option {i + 1}",
            probability=p_norm,
            odds=prob_to_odds(p_norm),
        )
        session.add(outcome)
    session.commit()
    return serialize_event(session, event)


@router.delete("/{event_id}")
def delete_event(
    event_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict:
    event = session.exec(select(Event).where(Event.id == event_id)).first()
    if not event:
        raise HTTPException(status_code=404, detail="event not found")
    if event.owner_id != user.id:
        raise HTTPException(status_code=403, detail="not your event")
    if event.resolved_outcome_index is not None:
        raise HTTPException(status_code=409, detail="already resolved")
    # delete outcomes too
    outs = session.exec(select(Outcome).where(Outcome.event_id == event.id)).all()
    for o in outs:
        session.delete(o)
    session.delete(event)
    session.commit()
    return {"ok": True}
