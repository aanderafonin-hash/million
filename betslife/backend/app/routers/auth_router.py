import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ..auth import (
    get_current_user,
    hash_password,
    make_token,
    pwd_ctx,
    verify_password,
)
from ..db import get_session
from ..models import User
from ..schemas import (
    ChangePasswordIn,
    LoginIn,
    RecoveryConfirmIn,
    RecoveryRequestIn,
    RegisterIn,
    TokenOut,
    UpdateProfileIn,
    UserOut,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_to_out(u: User, recovery_code: str | None = None) -> UserOut:
    return UserOut(
        id=u.id,
        username=u.username,
        avatar=u.avatar,
        balance=u.balance,
        created_at=u.created_at,
        recovery_code=recovery_code,
    )


@router.post("/register", response_model=TokenOut)
def register(payload: RegisterIn, session: Session = Depends(get_session)) -> TokenOut:
    existing = session.exec(
        select(User).where(User.username == payload.username)
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="username taken")

    recovery_code = secrets.token_hex(4).upper()  # 8 hex chars, e.g. A1B2C3D4
    u = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        avatar=payload.avatar or "🦊",
        recovery_code_hash=hash_password(recovery_code),
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
    if payload.avatar:
        user.avatar = payload.avatar
        session.add(user)
        session.commit()
        session.refresh(user)
    return _user_to_out(user)
