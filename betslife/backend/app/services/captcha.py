"""Simple math CAPTCHA stored server-side.

Issue: client requests /api/auth/captcha → server returns {token, question}, e.g.
{"token": "abc...", "question": "7 + 4"}. Client sends `captcha_token` and
`captcha_answer` along with the registration payload. Server verifies that the
token exists, isn't expired, hasn't been used, and that the answer matches.

Tokens expire in 5 minutes and are single-use to avoid replay.
"""
import random
import secrets
from datetime import datetime, timedelta
from typing import Tuple

from sqlmodel import Session, select

from ..models import CaptchaChallenge

CAPTCHA_TTL_SEC = 5 * 60


def _new_question() -> Tuple[str, str]:
    a = random.randint(2, 12)
    b = random.randint(2, 12)
    op = random.choice(["+", "-", "×"])
    if op == "+":
        ans = a + b
    elif op == "-":
        if a < b:
            a, b = b, a
        ans = a - b
    else:
        ans = a * b
    return f"{a} {op} {b}", str(ans)


def issue_captcha(session: Session) -> dict:
    question, answer = _new_question()
    token = secrets.token_urlsafe(16)
    challenge = CaptchaChallenge(
        token=token,
        answer=answer,
        expires_at=datetime.utcnow() + timedelta(seconds=CAPTCHA_TTL_SEC),
    )
    session.add(challenge)
    session.commit()
    return {"token": token, "question": question}


def verify_captcha(session: Session, token: str, answer: str) -> bool:
    if not token or not answer:
        return False
    ch = session.exec(
        select(CaptchaChallenge).where(CaptchaChallenge.token == token)
    ).first()
    if not ch or ch.used or ch.expires_at < datetime.utcnow():
        return False
    if (answer or "").strip() != ch.answer:
        return False
    ch.used = True
    session.add(ch)
    session.commit()
    return True
