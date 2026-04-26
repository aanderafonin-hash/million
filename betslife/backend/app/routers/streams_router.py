from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..auth import get_current_user
from ..db import get_session
from ..models import Event, Stream, User
from ..schemas import StreamOut, StreamStartIn
from ..services.viewers import count as viewer_count

router = APIRouter(prefix="/api/streams", tags=["streams"])


def _stream_to_out(session: Session, stream: Stream) -> StreamOut:
    owner = session.exec(select(User).where(User.id == stream.owner_id)).first()
    return StreamOut(
        event_id=stream.event_id,
        owner_id=stream.owner_id,
        owner_username=owner.username if owner else "?",
        url=stream.url,
        started_at=stream.started_at,
        is_live=stream.is_live,
        viewers=viewer_count(stream.event_id),
    )


@router.get("", response_model=List[StreamOut])
def list_live_streams(session: Session = Depends(get_session)) -> List[StreamOut]:
    streams = session.exec(select(Stream).where(Stream.is_live == True)).all()
    return [_stream_to_out(session, s) for s in streams]


@router.get("/{event_id}", response_model=StreamOut | None)
def get_stream(event_id: int, session: Session = Depends(get_session)) -> StreamOut | None:
    s = session.exec(
        select(Stream).where(Stream.event_id == event_id, Stream.is_live == True)
    ).first()
    if not s:
        return None
    return _stream_to_out(session, s)


@router.post("/{event_id}/start", response_model=StreamOut)
def start_stream(
    event_id: int,
    payload: StreamStartIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> StreamOut:
    event = session.exec(select(Event).where(Event.id == event_id)).first()
    if not event:
        raise HTTPException(status_code=404, detail="event not found")
    s = session.exec(select(Stream).where(Stream.event_id == event_id)).first()
    if s:
        s.url = payload.url
        s.started_at = datetime.utcnow()
        s.owner_id = user.id
        s.is_live = True
    else:
        s = Stream(
            event_id=event_id,
            owner_id=user.id,
            url=payload.url,
            is_live=True,
        )
    session.add(s)
    session.commit()
    session.refresh(s)
    return _stream_to_out(session, s)


@router.post("/{event_id}/stop", response_model=StreamOut)
def stop_stream(
    event_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> StreamOut:
    s = session.exec(select(Stream).where(Stream.event_id == event_id)).first()
    if not s:
        raise HTTPException(status_code=404, detail="no stream")
    if s.owner_id != user.id:
        raise HTTPException(status_code=403, detail="not your stream")
    s.is_live = False
    session.add(s)
    session.commit()
    session.refresh(s)
    return _stream_to_out(session, s)
