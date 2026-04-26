"""Seed the DB with the default catalogue of life/weird events on first start."""
from sqlmodel import Session, select

from ..models import Event, Outcome
from ..services.odds import normalize_probabilities, prob_to_odds


SEED_EVENTS = [
    # life
    {
        "title": "Кот скинет что-то со стола сегодня",
        "description": "Любой неконтролируемый акт котоагрессии.",
        "category": "life",
        "emoji": "🐈",
        "color1": "#ff7a18",
        "color2": "#3a8dff",
        "outcomes": [("Скинет", 0.65), ("Будет послушным", 0.35)],
    },
    {
        "title": "Опоздание на работу/учёбу завтра",
        "description": "Опоздание = больше 5 минут от плана.",
        "category": "life",
        "emoji": "⏰",
        "color1": "#f04a4a",
        "color2": "#7a1212",
        "outcomes": [("Опоздаешь", 0.4), ("В срок", 0.5), ("Прогул", 0.1)],
    },
    {
        "title": "Сосед включит дрель в выходной",
        "description": "До 12:00 в субботу/воскресенье.",
        "category": "home",
        "emoji": "🛠️",
        "color1": "#ff9f43",
        "color2": "#a44a14",
        "outcomes": [("Включит", 0.55), ("Тишина", 0.45)],
    },
    {
        "title": "Курьер опоздает с доставкой",
        "description": "Опоздание = больше 15 минут от обещанного слота.",
        "category": "life",
        "emoji": "📦",
        "color1": "#3aff8d",
        "color2": "#1a6b3d",
        "outcomes": [("Опоздает", 0.55), ("Вовремя", 0.45)],
    },
    {
        "title": "Митинг выйдет за слот",
        "description": "Корпоративная классика.",
        "category": "office",
        "emoji": "💼",
        "color1": "#3a8dff",
        "color2": "#13386b",
        "outcomes": [("Выйдет", 0.7), ("Закроется в срок", 0.3)],
    },
    # weird
    {
        "title": "Приснится бывший/ая на этой неделе",
        "description": "Только если запомнишь сон.",
        "category": "weird",
        "emoji": "😴",
        "color1": "#a35cff",
        "color2": "#3d1d6b",
        "outcomes": [("Приснится", 0.45), ("Нет", 0.55)],
    },
    {
        "title": "Найдёшь в кармане забытые деньги",
        "description": "Проверь все карманы — даже зимней куртки.",
        "category": "weird",
        "emoji": "💰",
        "color1": "#ffce3a",
        "color2": "#a37412",
        "outcomes": [("Найдёшь", 0.3), ("Пусто", 0.7)],
    },
    {
        "title": "Сегодня встретишь знакомого на улице",
        "description": "Засчитывается реальная встреча, не в чате.",
        "category": "life",
        "emoji": "👋",
        "color1": "#3aff8d",
        "color2": "#1a6b3d",
        "outcomes": [("Встретишь", 0.5), ("Нет", 0.5)],
    },
    {
        "title": "Завтра проспишь будильник",
        "description": "Выключение будильника во сне = победа этого исхода.",
        "category": "home",
        "emoji": "🛏️",
        "color1": "#ff7a18",
        "color2": "#aa4a04",
        "outcomes": [("Просплю", 0.4), ("Встану по будильнику", 0.6)],
    },
    {
        "title": "В метро/автобусе сегодня будут массовые задержки",
        "description": "Объявления о задержке/сбое.",
        "category": "life",
        "emoji": "🚇",
        "color1": "#3a8dff",
        "color2": "#13386b",
        "outcomes": [("Будут", 0.35), ("Всё ок", 0.65)],
    },
]


def seed_if_empty(session: Session) -> int:
    """Insert seed events only if the events table is empty (no user/sport/etc events)."""
    has_any = session.exec(select(Event).limit(1)).first()
    if has_any:
        return 0
    added = 0
    for s in SEED_EVENTS:
        event = Event(
            owner_id=None,
            title=s["title"],
            description=s["description"],
            category=s["category"],
            emoji=s["emoji"],
            color1=s["color1"],
            color2=s["color2"],
            source="seed",
        )
        session.add(event)
        session.commit()
        session.refresh(event)
        probs = normalize_probabilities([p for _, p in s["outcomes"]])
        for i, ((label, _orig), p) in enumerate(zip(s["outcomes"], probs)):
            session.add(
                Outcome(
                    event_id=event.id,
                    idx=i,
                    label=label,
                    probability=p,
                    odds=prob_to_odds(p),
                )
            )
        session.commit()
        added += 1
    return added
