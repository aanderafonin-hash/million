from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..auth import get_current_user
from ..db import get_session
from ..models import Transaction, User
from ..schemas import TopUpIn, TransactionOut, UserOut, WithdrawIn

router = APIRouter(prefix="/api/payments", tags=["payments"])


def _user_to_out(u: User) -> UserOut:
    return UserOut(
        id=u.id, username=u.username, avatar=u.avatar,
        balance=u.balance, created_at=u.created_at,
    )


@router.post("/topup", response_model=UserOut)
def topup(
    payload: TopUpIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> UserOut:
    if payload.amount > 1_000_000:
        raise HTTPException(status_code=400, detail="amount too large")
    user.balance = round(user.balance + payload.amount, 2)
    session.add(user)
    session.add(
        Transaction(
            user_id=user.id,
            type="topup",
            amount=payload.amount,
            balance_after=user.balance,
            note="Top up",
        )
    )
    session.commit()
    session.refresh(user)
    return _user_to_out(user)


@router.post("/withdraw", response_model=UserOut)
def withdraw(
    payload: WithdrawIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> UserOut:
    if payload.amount > user.balance:
        raise HTTPException(status_code=400, detail="insufficient balance")
    user.balance = round(user.balance - payload.amount, 2)
    session.add(user)
    session.add(
        Transaction(
            user_id=user.id,
            type="withdraw",
            amount=-payload.amount,
            balance_after=user.balance,
            note="Withdraw",
        )
    )
    session.commit()
    session.refresh(user)
    return _user_to_out(user)


@router.get("/transactions", response_model=List[TransactionOut])
def list_transactions(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> List[TransactionOut]:
    txs = session.exec(
        select(Transaction)
        .where(Transaction.user_id == user.id)
        .order_by(Transaction.created_at.desc())
        .limit(200)
    ).all()
    return [TransactionOut.model_validate(t) for t in txs]
