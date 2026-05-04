"""In-process viewer/watcher tracking by event_id.

We keep a set of WebSocket-or-session ids per event so the API can report
real live viewer counts. Counts are eventually consistent (single-process).
"""
from collections import defaultdict
from typing import Dict, Set

_viewers: Dict[int, Set[str]] = defaultdict(set)


def join(event_id: int, sid: str) -> int:
    _viewers[event_id].add(sid)
    return len(_viewers[event_id])


def leave(event_id: int, sid: str) -> int:
    if sid in _viewers.get(event_id, set()):
        _viewers[event_id].discard(sid)
    return len(_viewers.get(event_id, set()))


def count(event_id: int) -> int:
    return len(_viewers.get(event_id, set()))


def all_counts() -> Dict[int, int]:
    return {eid: len(s) for eid, s in _viewers.items() if s}
