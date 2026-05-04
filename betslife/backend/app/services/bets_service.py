import random
from datetime import datetime
from typing import List

from sqlmodel import Session, select

from ..models import Bet, BetLeg, Event, Outcome, Transaction, User
from ..schemas import BetLegOut, BetOut


def serialize_bet(session: Session, bet: Bet) -> BetOut:
    legs = session.exec(select(BetLeg).where(BetLeg.bet_id == bet.id).order_by(BetLeg.id)).all()
    leg_outs: List[BetLegOut] = []
    for leg in legs:
        ev = session.exec(select(Event).where(Event.id == leg.event_id)).first()
        title = ev.title if ev else f"Event #{leg.event_id}"
        resolved_idx = ev.resolved_outcome_index if ev else None
        resolved_label = None
        if resolved_idx is not None and ev:
            o = session.exec(
                select(Outcome).where(Outcome.event_id == ev.id, Outcome.idx == resolved_idx)
            ).first()
            if o:
                resolved_label = o.label
        leg_outs.append(
            BetLegOut(
                event_id=leg.event_id,
                event_title=title,
                outcome_idx=leg.outcome_idx,
                outcome_label=leg.outcome_label,
                odds=leg.odds,
                status=leg.status,
                resolved_outcome_index=resolved_idx,
                resolved_outcome_label=resolved_label,
            )
        )
    return BetOut(
        id=bet.id,
        stake=bet.stake,
        total_odds=bet.total_odds,
        possible_win=bet.possible_win,
        status=bet.status,
        payout=bet.payout,
        created_at=bet.created_at,
        resolved_at=bet.resolved_at,
        legs=leg_outs,
    )


def pick_weighted_outcome(outcomes: List[Outcome]) -> Outcome:
    weights = [max(0.000001, o.probability) for o in outcomes]
    total = sum(weights)
    r = random.random() * total
    s = 0.0
    for o, w in zip(outcomes, weights):
        s += w
        if r <= s:
            return o
    return outcomes[-1]


def resolve_event(session: Session, event: Event, forced_idx: int | None = None) -> Outcome:
    outcomes = session.exec(
        select(Outcome).where(Outcome.event_id == event.id).order_by(Outcome.idx)
    ).all()
    if not outcomes:
        raise RuntimeError(f"event #{event.id} has no outcomes")
    if forced_idx is not None and 0 <= forced_idx < len(outcomes):
        chosen = outcomes[forced_idx]
    else:
        chosen = pick_weighted_outcome(outcomes)
    event.resolved_outcome_index = chosen.idx
    event.resolved_at = datetime.utcnow()
    session.add(event)

    # update all pending legs that bet on this event
    legs = session.exec(
        select(BetLeg).where(BetLeg.event_id == event.id, BetLeg.status == "pending")
    ).all()
    for leg in legs:
        leg.status = "won" if leg.outcome_idx == chosen.idx else "lost"
        session.add(leg)

    # commit so subsequent bet checks see updated leg statuses
    session.commit()

    # find affected bets
    bet_ids = {leg.bet_id for leg in legs}
    for bet_id in bet_ids:
        bet = session.exec(select(Bet).where(Bet.id == bet_id, Bet.status == "pending")).first()
        if not bet:
            continue
        all_legs = session.exec(select(BetLeg).where(BetLeg.bet_id == bet.id)).all()
        if any(l.status == "pending" for l in all_legs):
            continue
        if all(l.status == "won" for l in all_legs):
            payout = round(bet.stake * bet.total_odds, 2)
            bet.status = "won"
            bet.payout = payout
            bet.resolved_at = datetime.utcnow()
            user = session.exec(select(User).where(User.id == bet.user_id)).first()
            if user:
                user.balance = round(user.balance + payout, 2)
                session.add(user)
                tx = Transaction(
                    user_id=user.id,
                    type="win",
                    amount=payout,
                    balance_after=user.balance,
                    bet_id=bet.id,
                    note=f"Win: {bet.total_odds:.2f}× × {bet.stake:.0f} ₽",
                )
                session.add(tx)
        else:
            bet.status = "lost"
            bet.resolved_at = datetime.utcnow()
        session.add(bet)
    session.commit()
    return chosen
