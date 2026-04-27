import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..auth import (
    get_current_user,
    hash_password,
    make_token,
    verify_password,
)
from ..config import settings
from ..db import get_session
from ..models import User
from ..schemas import (
    CaptchaIssueOut,
    ChangePasswordIn,
    LoginIn,
    RecoveryConfirmIn,
    RecoveryRequestIn,
    RegisterIn,
    TokenOut,
    UpdateProfileIn,
    UserOut,
)
from ..services.captcha import issue_captcha, verify_captcha

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_to_out(u: User, recovery_code: str | None = None) -> UserOut:
    return UserOut(
        id=u.id,
        username=u.username,
        email=u.email,
        avatar=u.avatar,
        avatar_url=u.avatar_url,
        balance=u.balance,
        created_at=u.created_at,
        is_admin=bool(u.is_admin),
        is_moderator=bool(u.is_moderator),
        is_banned=bool(u.is_banned),
        chat_muted_until=u.chat_muted_until,
        recovery_code=recovery_code,
    )


@router.get("/captcha", response_model=CaptchaIssueOut)
def captcha(session: Session = Depends(get_session)) -> CaptchaIssueOut:
    return CaptchaIssueOut(**issue_captcha(session))


@router.post("/register", response_model=TokenOut)
def register(payload: RegisterIn, session: Session = Depends(get_session)) -> TokenOut:
    if not verify_captcha(session, payload.captcha_token, payload.captcha_answer):
        raise HTTPException(status_code=400, detail="captcha failed")

    existing = session.exec(
        select(User).where(User.username == payload.username)
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="username taken")

    if payload.email:
        same_email = session.exec(
            select(User).where(User.email == str(payload.email))
        ).first()
        if same_email:
            raise HTTPException(status_code=409, detail="email already used")

    recovery_code = secrets.token_hex(4).upper()  # 8 hex chars, e.g. A1B2C3D4
    is_admin = payload.username.lower() == settings.initial_admin_username.lower()
    u = User(
        username=payload.username,
        email=str(payload.email) if payload.email else None,
        password_hash=hash_password(payload.password),
        avatar=payload.avatar or "🦊",
        recovery_code_hash=hash_password(recovery_code),
        is_admin=is_admin,
        is_moderator=is_admin,
    )
    session.add(u)
    session.commit()
    session.refresh(u)
    return TokenOut(access_token=make_token(u.id), user=_user_to_out(u, recovery_code=recovery_code))


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, session: Session = Depends(get_session)) -> TokenOut:
    u = session.exec(select(User).where(User.username == payload.username)).first()
    if not u or not verify_password(payload.password, u.password_hash):
        raise HTTPException(status_code=401, detail="invalid credentials")
    if u.is_banned:
        raise HTTPException(status_code=403, detail="account banned")
    # Auto-promote initial admin if it wasn't set yet (handles old records).
    if (
        not u.is_admin
        and u.username.lower() == settings.initial_admin_username.lower()
    ):
        u.is_admin = True
        u.is_moderator = True
        session.add(u)
        session.commit()
        session.refresh(u)
    return TokenOut(access_token=make_token(u.id), user=_user_to_out(u))


@router.post("/recovery/check")
def recovery_check(payload: RecoveryRequestIn, session: Session = Depends(get_session)) -> dict:
    u = session.exec(select(User).where(User.username == payload.username)).first()
    return {"exists": bool(u and u.recovery_code_hash)}


@router.post("/recovery/confirm", response_model=TokenOut)
def recovery_confirm(payload: RecoveryConfirmIn, session: Session = Depends(get_session)) -> TokenOut:
    u = session.exec(select(User).where(User.username == payload.username)).first()
    if not u or not u.recovery_code_hash:
        raise HTTPException(status_code=404, detail="user not found")
    if not verify_password(payload.recovery_code, u.recovery_code_hash):
        raise HTTPException(status_code=401, detail="invalid recovery code")
    u.password_hash = hash_password(payload.new_password)
    session.add(u)
    session.commit()
    session.refresh(u)
    return TokenOut(access_token=make_token(u.id), user=_user_to_out(u))


@router.post("/change-password", response_model=UserOut)
def change_password(
    payload: ChangePasswordIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> UserOut:
    if not verify_password(payload.old_password, user.password_hash):
        raise HTTPException(status_code=401, detail="wrong old password")
    user.password_hash = hash_password(payload.new_password)
    session.add(user)
    session.commit()
    session.refresh(user)
    return _user_to_out(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return _user_to_out(user)


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: UpdateProfileIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> UserOut:
    changed = False
    if payload.avatar:
        user.avatar = payload.avatar
        changed = True
    if payload.email is not None:
        # Allow clearing by passing empty string? We accept None to unset.
        new_email = str(payload.email) if payload.email else None
        if new_email and new_email != user.email:
            same = session.exec(
                select(User).where(User.email == new_email, User.id != user.id)
            ).first()
            if same:
                raise HTTPException(status_code=409, detail="email already used")
        user.email = new_email
        changed = True
    if changed:
        session.add(user)
        session.commit()
        session.refresh(user)
    return _user_to_out(user)
