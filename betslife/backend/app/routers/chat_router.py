import asyncio
import json
import secrets
from typing import Dict, List, Set

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlmodel import Session, select

from ..auth import decode_token, get_current_user
from ..db import get_session, session_scope
from ..models import ChatMessage, Event, User
from ..schemas import ChatMessageIn, ChatMessageOut
from ..services.viewers import join, leave

router = APIRouter(prefix="/api/chat", tags=["chat"])


# Connections: event_id -> set of WebSocket
connections: Dict[int, Set[WebSocket]] = {}
_lock = asyncio.Lock()


async def _broadcast(event_id: int, payload: dict) -> None:
    async with _lock:
        ws_list = list(connections.get(event_id, []))
    text = json.dumps(payload, default=str)
    for ws in ws_list:
        try:
            await ws.send_text(text)
        except Exception:
            pass


def _msg_to_out(session: Session, msg: ChatMessage) -> ChatMessageOut:
    user = session.exec(select(User).where(User.id == msg.user_id)).first()
    return ChatMessageOut(
        id=msg.id,
        event_id=msg.event_id,
        user_id=msg.user_id,
        username=user.username if user else "?",
        avatar=user.avatar if user else "🦊",
        text=msg.text,
        created_at=msg.created_at,
    )


@router.get("/{event_id}", response_model=List[ChatMessageOut])
def history(
    event_id: int, session: Session = Depends(get_session), limit: int = 100
) -> List[ChatMessageOut]:
    msgs = session.exec(
        select(ChatMessage)
        .where(ChatMessage.event_id == event_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    ).all()
    msgs = list(reversed(msgs))
    return [_msg_to_out(session, m) for m in msgs]


@router.post("/{event_id}", response_model=ChatMessageOut)
async def post_message(
    event_id: int,
    payload: ChatMessageIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ChatMessageOut:
    event = session.exec(select(Event).where(Event.id == event_id)).first()
    if not event:
        raise HTTPException(status_code=404, detail="event not found")
    msg = ChatMessage(event_id=event_id, user_id=user.id, text=payload.text.strip())
    session.add(msg)
    session.commit()
    session.refresh(msg)
    out = _msg_to_out(session, msg)
    await _broadcast(event_id, {"type": "chat", "message": out.model_dump(mode="json")})
    return out


@router.websocket("/ws/{event_id}")
async def chat_ws(websocket: WebSocket, event_id: int) -> None:
    await websocket.accept()
    sid = secrets.token_hex(8)

    # auth via initial frame: {"type":"hello","token":"..."} (token optional for read-only)
    token: str | None = None
    user_id: int | None = None
    try:
        first = await asyncio.wait_for(websocket.receive_text(), timeout=10)
        data = json.loads(first)
        token = data.get("token")
        if token:
            user_id = decode_token(token)
    except Exception:
        pass

    async with _lock:
        connections.setdefault(event_id, set()).add(websocket)
    viewers = join(event_id, sid)
    await _broadcast(event_id, {"type": "viewers", "event_id": event_id, "viewers": viewers})

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except Exception:
                continue
            if data.get("type") != "chat":
                continue
            if not user_id:
                await websocket.send_text(json.dumps({"type": "error", "error": "auth required"}))
                continue
            text = (data.get("text") or "").strip()
            if not text or len(text) > 500:
                continue
            with session_scope() as s:
                user = s.exec(select(User).where(User.id == user_id)).first()
                event = s.exec(select(Event).where(Event.id == event_id)).first()
                if not user or not event:
                    continue
                msg = ChatMessage(event_id=event_id, user_id=user.id, text=text)
                s.add(msg)
                s.commit()
                s.refresh(msg)
                out = _msg_to_out(s, msg)
            await _broadcast(event_id, {"type": "chat", "message": out.model_dump(mode="json")})
    except WebSocketDisconnect:
        pass
    finally:
        async with _lock:
            if event_id in connections:
                connections[event_id].discard(websocket)
                if not connections[event_id]:
                    del connections[event_id]
        viewers = leave(event_id, sid)
        try:
            await _broadcast(event_id, {"type": "viewers", "event_id": event_id, "viewers": viewers})
        except Exception:
            pass
