from typing import List, Optional

from sqlalchemy import func
from sqlmodel import Session, select

from ..models import Bet, BetLeg, Event, Outcome, Stream, User
from ..schemas import EventOut, OutcomeOut


def compute_volumes_by_event(session: Session) -> dict[int, float]:
    """Aggregate total stake volume per event by joining bets with legs."""
    rows = session.exec(
        select(BetLeg.event_id, func.sum(Bet.stake))
        .join(Bet, Bet.id == BetLeg.bet_id)
        .group_by(BetLeg.event_id)
    ).all()
    out: dict[int, float] = {}
    for row in rows:
        # SQLAlchemy may return Row or tuple; both unpack the same way.
        eid, vol = row
        if eid is None:
            continue
        out[int(eid)] = float(vol or 0.0)
    return out


def serialize_event(
    session: Session,
    event: Event,
    viewer_counts: Optional[dict[int, int]] = None,
    live_event_ids: Optional[set[int]] = None,
    volumes_by_event: Optional[dict[int, float]] = None,
) -> EventOut:
    outs = session.exec(
        select(Outcome).where(Outcome.event_id == event.id).order_by(Outcome.idx)
    ).all()
    owner_username: Optional[str] = None
    owner_avatar: Optional[str] = None
    if event.owner_id is not None:
        owner = session.exec(select(User).where(User.id == event.owner_id)).first()
        if owner:
            owner_username = owner.username
            owner_avatar = owner.avatar

    is_live = False
    if live_event_ids is not None:
        is_live = event.id in live_event_ids
    else:
        live = session.exec(
            select(Stream).where(Stream.event_id == event.id, Stream.is_live == True)
        ).first()
        is_live = bool(live)

    viewers = 0
    if viewer_counts and event.id in viewer_counts:
        viewers = viewer_counts[event.id]

    return EventOut(
        id=event.id,
        owner_id=event.owner_id,
        owner_username=owner_username,
        owner_avatar=owner_avatar,
        title=event.title,
        description=event.description,
        category=event.category,
        emoji=event.emoji,
        color1=event.color1,
        color2=event.color2,
        image_data_url=event.image_data_url,
        source=event.source,
        starts_at=event.starts_at,
        resolves_at=event.resolves_at,
        resolved_outcome_index=event.resolved_outcome_index,
        outcomes=[
            OutcomeOut(idx=o.idx, label=o.label, probability=o.probability, odds=o.odds)
            for o in outs
        ],
        is_live=is_live,
        viewers=viewers,
        volume=(volumes_by_event or {}).get(event.id, 0.0),
    )


def list_active_events(session: Session) -> List[Event]:
    return session.exec(
        select(Event)
        .where(Event.resolved_outcome_index == None)  # noqa: E711
        .order_by(Event.created_at.desc())
    ).all()
