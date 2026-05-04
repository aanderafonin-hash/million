"""Seed the DB with a Polymarket-style catalogue of realistic events.

A `SEED_VERSION` flag lets us replace the old seed catalogue without manual
DB intervention: when the version on disk differs from the constant here,
all `source='seed'` events are cleared (along with their outcomes, bet legs
and any bets referencing them) and the new catalogue is inserted.
"""
from datetime import datetime

from sqlmodel import Session, select

from ..models import Bet, BetLeg, Event, Outcome
from ..services.odds import normalize_probabilities, prob_to_odds


SEED_VERSION = "v3-launch-2026-05"


def _d(iso: str) -> datetime:
    return datetime.fromisoformat(iso)


SEED_EVENTS: list[dict] = [
    # ───────────── Политика (мир) ─────────────
    {
        "title": "США снимут пошлины с китайского импорта в 2026?",
        "description": "Резолв: до 31.12.2026 США объявят о снятии или существенном снижении (>50%) тарифов, введённых в 2025.",
        "category": "politics", "emoji": "🇺🇸",
        "color1": "#3a82f7", "color2": "#1d4ed8",
        "outcomes": [("Да", 0.22), ("Нет", 0.78)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Состоится ли встреча Путин — Трамп до конца 2026?",
        "description": "Любая личная очная встреча двух лидеров до 31.12.2026.",
        "category": "politics", "emoji": "🤝",
        "color1": "#ef4a4a", "color2": "#b71c1c",
        "outcomes": [("Состоится", 0.55), ("Не состоится", 0.45)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Будет ли в США shutdown правительства в 2026?",
        "description": "Полное или частичное прекращение работы федерального правительства США из-за непринятия бюджета.",
        "category": "politics", "emoji": "🏛️",
        "color1": "#94a3b8", "color2": "#475569",
        "outcomes": [("Будет", 0.62), ("Не будет", 0.38)],
        "resolves_at": "2026-10-01T00:00:00",
    },
    {
        "title": "Украина и Россия подпишут перемирие до конца 2026?",
        "description": "Любая официальная договорённость о прекращении огня между сторонами до 31.12.2026.",
        "category": "politics", "emoji": "🕊️",
        "color1": "#10b981", "color2": "#047857",
        "outcomes": [("Да", 0.30), ("Нет", 0.70)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Трамп объявит о баллотировании на третий срок?",
        "description": "Дональд Трамп публично заявит о намерении баллотироваться в 2028 несмотря на 22-ю поправку.",
        "category": "politics", "emoji": "🇺🇸",
        "color1": "#dc2626", "color2": "#7f1d1d",
        "outcomes": [("Объявит", 0.12), ("Не объявит", 0.88)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Илон Маск выйдет из DOGE до конца 2026?",
        "description": "Официальный уход Маска с поста руководителя Department of Government Efficiency.",
        "category": "politics", "emoji": "🐕",
        "color1": "#fbbf24", "color2": "#92400e",
        "outcomes": [("Выйдет", 0.72), ("Останется", 0.28)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Демократы вернут контроль над Палатой представителей в 2026?",
        "description": "По итогам midterms 2026 большинство в House of Representatives получат демократы.",
        "category": "politics", "emoji": "🇺🇸",
        "color1": "#2563eb", "color2": "#1e3a8a",
        "outcomes": [("Да", 0.56), ("Нет", 0.44)],
        "resolves_at": "2026-11-04T23:59:00",
    },
    {
        "title": "ЕС снимет часть санкций с РФ в 2026?",
        "description": "Хотя бы один пакет санкций ЕС против России будет отменён или существенно ослаблен.",
        "category": "politics", "emoji": "🇪🇺",
        "color1": "#1d4ed8", "color2": "#172554",
        "outcomes": [("Снимет", 0.25), ("Не снимет", 0.75)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Си Цзиньпин посетит Москву в 2026?",
        "description": "Официальный визит Си Цзиньпина в Россию с встречей с Путиным в 2026.",
        "category": "politics", "emoji": "🇨🇳",
        "color1": "#dc2626", "color2": "#7f1d1d",
        "outcomes": [("Посетит", 0.38), ("Не посетит", 0.62)],
        "resolves_at": "2026-12-31T23:59:00",
    },

    # ───────────── Крипта ─────────────
    {
        "title": "Bitcoin превысит $150 000 в 2026?",
        "description": "BTC закроется хотя бы один день выше $150 000 (по CoinGecko USD) в 2026 году.",
        "category": "crypto", "emoji": "₿",
        "color1": "#f7931a", "color2": "#b06600",
        "outcomes": [("Да", 0.42), ("Нет", 0.58)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Bitcoin превысит $200 000 в 2026?",
        "description": "BTC закроется хотя бы один день выше $200 000 в 2026.",
        "category": "crypto", "emoji": "🚀",
        "color1": "#f97316", "color2": "#7c2d12",
        "outcomes": [("Да", 0.18), ("Нет", 0.82)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Ethereum обгонит Bitcoin по капитализации в 2026?",
        "description": "Любой день в 2026, когда Market Cap ETH > Market Cap BTC по CoinGecko.",
        "category": "crypto", "emoji": "Ξ",
        "color1": "#627eea", "color2": "#3c5ad8",
        "outcomes": [("Да", 0.07), ("Нет", 0.93)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "SEC одобрит Solana ETF до конца 2026?",
        "description": "Любой spot Solana ETF с одобрением SEC, торгуемый на регулируемой бирже.",
        "category": "crypto", "emoji": "🪙",
        "color1": "#14f195", "color2": "#0c8a55",
        "outcomes": [("Одобрит", 0.65), ("Нет", 0.35)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Bitcoin упадёт ниже $50 000 в 2026?",
        "description": "Любой закрывающий день в 2026, где BTC < $50 000.",
        "category": "crypto", "emoji": "📉",
        "color1": "#ef4a4a", "color2": "#7a1212",
        "outcomes": [("Упадёт", 0.18), ("Не упадёт", 0.82)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "США создадут стратегический BTC-резерв в 2026?",
        "description": "Официальный закон или исполнительный указ о создании Strategic Bitcoin Reserve в США.",
        "category": "crypto", "emoji": "🇺🇸",
        "color1": "#f7931a", "color2": "#b06600",
        "outcomes": [("Создадут", 0.58), ("Не создадут", 0.42)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Россия легализует майнинг для экспорта в 2026?",
        "description": "Принятие закона, позволяющего российским компаниям майнить крипту для международных расчётов.",
        "category": "crypto", "emoji": "⛏️",
        "color1": "#a855f7", "color2": "#581c87",
        "outcomes": [("Да", 0.45), ("Нет", 0.55)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "TON достигнет $10 в 2026?",
        "description": "Токен Toncoin (TON) закроется ≥ $10 (по CoinGecko USD) в любой день 2026.",
        "category": "crypto", "emoji": "💎",
        "color1": "#0088cc", "color2": "#003d5c",
        "outcomes": [("Да", 0.22), ("Нет", 0.78)],
        "resolves_at": "2026-12-31T23:59:00",
    },

    # ───────────── Технологии ─────────────
    {
        "title": "GPT-5 выйдет до конца 2026?",
        "description": "Официальный публичный релиз модели от OpenAI с названием GPT-5 (не превью).",
        "category": "tech", "emoji": "🧠",
        "color1": "#10b981", "color2": "#047857",
        "outcomes": [("Выйдет", 0.72), ("Не выйдет", 0.28)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Apple выпустит складной iPhone до 2027?",
        "description": "Официальный анонс foldable iPhone до 31.12.2026.",
        "category": "tech", "emoji": "📱",
        "color1": "#a3a3a3", "color2": "#525252",
        "outcomes": [("Выпустит", 0.20), ("Не выпустит", 0.80)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Tesla запустит полностью автономное такси в 2026?",
        "description": "Робо-такси Tesla без оператора, доступный публично хотя бы в одном городе США.",
        "category": "tech", "emoji": "🚗",
        "color1": "#cc0000", "color2": "#7f0000",
        "outcomes": [("Запустит", 0.55), ("Не запустит", 0.45)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "SpaceX запустит пилотируемый корабль к Марсу в 2026?",
        "description": "Любой пилотируемый старт SpaceX к Марсу в 2026.",
        "category": "tech", "emoji": "🚀",
        "color1": "#ff5722", "color2": "#7a1f06",
        "outcomes": [("Да", 0.03), ("Нет", 0.97)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "OpenAI станет публичной (IPO) в 2026?",
        "description": "Официальный листинг акций OpenAI на любой бирже в 2026.",
        "category": "tech", "emoji": "🤖",
        "color1": "#10b981", "color2": "#047857",
        "outcomes": [("IPO", 0.25), ("Нет", 0.75)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "В России разблокируют WhatsApp в 2026?",
        "description": "Роскомнадзор отменит действующие ограничения на WhatsApp в 2026.",
        "category": "tech", "emoji": "💬",
        "color1": "#25d366", "color2": "#075e54",
        "outcomes": [("Разблокируют", 0.15), ("Нет", 0.85)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Telegram заблокируют в одной из стран ЕС в 2026?",
        "description": "Официальная блокировка Telegram в любой стране ЕС в 2026.",
        "category": "tech", "emoji": "✈️",
        "color1": "#3b82f6", "color2": "#1e3a8a",
        "outcomes": [("Заблокируют", 0.20), ("Нет", 0.80)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Россия полностью заблокирует YouTube в 2026?",
        "description": "Полное техническое ограничение YouTube на территории РФ до 31.12.2026.",
        "category": "tech", "emoji": "📺",
        "color1": "#ef4444", "color2": "#991b1b",
        "outcomes": [("Заблокируют", 0.55), ("Нет", 0.45)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Nvidia сохранит >$3Т капитализации к концу 2026?",
        "description": "Market Cap NVDA ≥ $3 трлн по состоянию на 31.12.2026.",
        "category": "tech", "emoji": "💚",
        "color1": "#76b900", "color2": "#3a5a00",
        "outcomes": [("Да", 0.65), ("Нет", 0.35)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Квантовый компьютер достигнет quantum supremacy для практической задачи в 2026?",
        "description": "Google/IBM/другая компания публично продемонстрирует решение практической задачи, невозможной на классическом ПК.",
        "category": "tech", "emoji": "⚛️",
        "color1": "#8b5cf6", "color2": "#4c1d95",
        "outcomes": [("Да", 0.28), ("Нет", 0.72)],
        "resolves_at": "2026-12-31T23:59:00",
    },

    # ───────────── Поп-культура ─────────────
    {
        "title": "Тейлор Свифт объявит о помолвке/свадьбе в 2026?",
        "description": "Публичное объявление о помолвке или свадьбе самой Тейлор Свифт в 2026.",
        "category": "culture", "emoji": "💍",
        "color1": "#ec4899", "color2": "#9d174d",
        "outcomes": [("Да", 0.62), ("Нет", 0.38)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "GTA VI выйдет до конца 2026?",
        "description": "Релиз GTA VI до 31.12.2026 (любая платформа).",
        "category": "culture", "emoji": "🎮",
        "color1": "#22c55e", "color2": "#15803d",
        "outcomes": [("Да", 0.55), ("Нет", 0.45)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Оскар 2026 за лучший фильм получит работа Кристофера Нолана?",
        "description": "Победитель в категории Best Picture на Academy Awards в марте 2026.",
        "category": "culture", "emoji": "🎬",
        "color1": "#fbbf24", "color2": "#a16207",
        "outcomes": [("Получит", 0.18), ("Нет", 0.82)],
        "resolves_at": "2026-03-15T23:59:00",
    },
    {
        "title": "Канье Уэст запустит новый альбом в 2026?",
        "description": "Официальный релиз нового студийного альбома Ye/Kanye West в 2026.",
        "category": "culture", "emoji": "🎵",
        "color1": "#eab308", "color2": "#713f12",
        "outcomes": [("Да", 0.70), ("Нет", 0.30)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Евровидение-2026 выиграет РФ-представитель?",
        "description": "Победа российского исполнителя на Евровидение 2026 (если РФ допустят).",
        "category": "culture", "emoji": "🎤",
        "color1": "#a855f7", "color2": "#581c87",
        "outcomes": [("Выиграет", 0.04), ("Нет", 0.96)],
        "resolves_at": "2026-05-20T23:59:00",
    },
    {
        "title": "Avatar 3 обгонит Avengers: Endgame по кассовым сборам?",
        "description": "Мировой бокс-офис Avatar 3 Fire and Ash > $2.797B (Endgame) в первый год проката.",
        "category": "culture", "emoji": "🎥",
        "color1": "#0ea5e9", "color2": "#0c4a6e",
        "outcomes": [("Да", 0.35), ("Нет", 0.65)],
        "resolves_at": "2026-12-31T23:59:00",
    },

    # ───────────── Спорт ─────────────
    {
        "title": "Россия вернётся на летние Олимпийские игры 2028?",
        "description": "Российские спортсмены под флагом РФ на Олимпиаде Лос-Анджелес 2028.",
        "category": "sport", "emoji": "🏅",
        "color1": "#f59e0b", "color2": "#92400e",
        "outcomes": [("Вернётся", 0.40), ("Нет", 0.60)],
        "resolves_at": "2028-07-14T23:59:00",
    },
    {
        "title": "Реал Мадрид выиграет Лигу чемпионов 2025/26?",
        "description": "Победитель UEFA Champions League 2025/26.",
        "category": "sport", "emoji": "⚽",
        "color1": "#fefefe", "color2": "#9ca3af",
        "outcomes": [("Да", 0.22), ("Нет", 0.78)],
        "resolves_at": "2026-05-30T23:59:00",
    },
    {
        "title": "Макс Ферстаппен возьмёт титул F1 в 2026?",
        "description": "Чемпион мира Formula 1 2026 — Max Verstappen.",
        "category": "sport", "emoji": "🏎️",
        "color1": "#1e40af", "color2": "#0b1f5c",
        "outcomes": [("Да", 0.45), ("Нет", 0.55)],
        "resolves_at": "2026-12-06T23:59:00",
    },
    {
        "title": "Холанд забьёт 40+ голов в АПЛ в сезоне 25/26?",
        "description": "Эрлинг Холанд забьёт ≥40 голов в матчах Premier League 2025/26.",
        "category": "sport", "emoji": "⚽",
        "color1": "#7dd3fc", "color2": "#0369a1",
        "outcomes": [("Да", 0.35), ("Нет", 0.65)],
        "resolves_at": "2026-05-24T23:59:00",
    },
    {
        "title": "Кубок Стэнли 2026 возьмут Эдмонтон Ойлерз?",
        "description": "Победитель NHL Stanley Cup Playoffs 2026 — Edmonton Oilers.",
        "category": "sport", "emoji": "🏒",
        "color1": "#ff4500", "color2": "#7f1d1d",
        "outcomes": [("Возьмут", 0.22), ("Не возьмут", 0.78)],
        "resolves_at": "2026-06-25T23:59:00",
    },
    {
        "title": "Джокович выиграет Grand Slam в 2026?",
        "description": "Новак Джокович победит на Australian Open, Ролан Гаррос, Уимблдоне или US Open 2026.",
        "category": "sport", "emoji": "🎾",
        "color1": "#eab308", "color2": "#713f12",
        "outcomes": [("Выиграет", 0.40), ("Нет", 0.60)],
        "resolves_at": "2026-09-10T23:59:00",
    },
    {
        "title": "Чемпионат мира по футболу 2026 выиграет Аргентина?",
        "description": "Победитель FIFA World Cup 2026 (США/Канада/Мексика) — сборная Аргентины.",
        "category": "sport", "emoji": "🏆",
        "color1": "#87ceeb", "color2": "#1e3a8a",
        "outcomes": [("Да", 0.16), ("Нет", 0.84)],
        "resolves_at": "2026-07-19T23:59:00",
    },
    {
        "title": "Зенит выиграет РПЛ в сезоне 25/26?",
        "description": "Чемпион Российской Премьер-Лиги 2025/26 — ФК Зенит.",
        "category": "sport", "emoji": "🇷🇺",
        "color1": "#00b2e3", "color2": "#005578",
        "outcomes": [("Да", 0.55), ("Нет", 0.45)],
        "resolves_at": "2026-05-30T23:59:00",
    },

    # ───────────── Экономика / жизнь ─────────────
    {
        "title": "Курс доллара превысит 110 ₽ в 2026?",
        "description": "Официальный курс ЦБ РФ ≥ 110 ₽/$ в любой день 2026 года.",
        "category": "life", "emoji": "💵",
        "color1": "#10b981", "color2": "#047857",
        "outcomes": [("Превысит", 0.60), ("Нет", 0.40)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Курс доллара превысит 130 ₽ в 2026?",
        "description": "Официальный курс ЦБ РФ ≥ 130 ₽/$ в любой день 2026.",
        "category": "life", "emoji": "📈",
        "color1": "#dc2626", "color2": "#7f1d1d",
        "outcomes": [("Да", 0.25), ("Нет", 0.75)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Ключевая ставка ЦБ РФ опустится ниже 15% в 2026?",
        "description": "Решение Банка России о снижении ключевой ставки до значения < 15% в 2026.",
        "category": "life", "emoji": "🏦",
        "color1": "#6366f1", "color2": "#3730a3",
        "outcomes": [("Опустится", 0.50), ("Нет", 0.50)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "АИ-95 в Москве превысит 80 ₽/л в 2026?",
        "description": "Средняя розничная цена АИ-95 на московских АЗС > 80 ₽ за литр (Росстат).",
        "category": "life", "emoji": "⛽",
        "color1": "#f59e0b", "color2": "#92400e",
        "outcomes": [("Превысит", 0.55), ("Нет", 0.45)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Нефть Brent превысит $100 в 2026?",
        "description": "Brent закроется выше $100 хотя бы один день в 2026.",
        "category": "life", "emoji": "🛢️",
        "color1": "#0f172a", "color2": "#020617",
        "outcomes": [("Превысит", 0.35), ("Нет", 0.65)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Золото превысит $3000/унц в 2026?",
        "description": "Spot-цена золота закроется выше $3000 за тройскую унцию в 2026.",
        "category": "life", "emoji": "🥇",
        "color1": "#fbbf24", "color2": "#a16207",
        "outcomes": [("Превысит", 0.78), ("Нет", 0.22)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Средний ипотечный платёж в Москве превысит 150к ₽ в 2026?",
        "description": "Средний ежемесячный платёж по рыночной ипотеке на вторичку в Москве > 150 000 ₽.",
        "category": "life", "emoji": "🏠",
        "color1": "#a855f7", "color2": "#581c87",
        "outcomes": [("Превысит", 0.72), ("Нет", 0.28)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "S&P 500 достигнет 7000 в 2026?",
        "description": "Индекс S&P 500 закроется ≥ 7000 хотя бы один день в 2026.",
        "category": "life", "emoji": "📊",
        "color1": "#16a34a", "color2": "#14532d",
        "outcomes": [("Да", 0.48), ("Нет", 0.52)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Инфляция в РФ за 2026 окажется выше 8%?",
        "description": "Годовой ИПЦ Росстата за 2026 > 8.0%.",
        "category": "life", "emoji": "📉",
        "color1": "#ef4444", "color2": "#7f1d1d",
        "outcomes": [("Да", 0.55), ("Нет", 0.45)],
        "resolves_at": "2027-01-15T23:59:00",
    },

    # ───────────── Наука и общество ─────────────
    {
        "title": "FDA одобрит первую таблетку Альцгеймера с реверс-эффектом в 2026?",
        "description": "Препарат с доказанным восстановлением когнитивных функций получит одобрение FDA в 2026.",
        "category": "tech", "emoji": "💊",
        "color1": "#8b5cf6", "color2": "#4c1d95",
        "outcomes": [("Одобрит", 0.15), ("Нет", 0.85)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "NASA подтвердит наличие жизни на Марсе в 2026?",
        "description": "Официальное заявление NASA о находке биосигнатуры или микроорганизмов на Марсе.",
        "category": "tech", "emoji": "👽",
        "color1": "#ef4444", "color2": "#7f1d1d",
        "outcomes": [("Да", 0.04), ("Нет", 0.96)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "Зафиксировано землетрясение магнитудой 8+ в 2026?",
        "description": "Любое землетрясение с магнитудой ≥ 8.0 по шкале Рихтера в 2026 (USGS).",
        "category": "life", "emoji": "🌋",
        "color1": "#dc2626", "color2": "#7f1d1d",
        "outcomes": [("Зафиксировано", 0.40), ("Нет", 0.60)],
        "resolves_at": "2026-12-31T23:59:00",
    },
    {
        "title": "2026 станет самым жарким годом в истории наблюдений?",
        "description": "Средняя глобальная температура 2026 > 2024 (NOAA/NASA).",
        "category": "weather", "emoji": "🌡️",
        "color1": "#f97316", "color2": "#7c2d12",
        "outcomes": [("Станет", 0.55), ("Не станет", 0.45)],
        "resolves_at": "2027-01-31T23:59:00",
    },
    {
        "title": "В Москве снег выпадет до 1 ноября 2026?",
        "description": "Устойчивый снежный покров в Москве до 01.11.2026 (Гидрометцентр).",
        "category": "weather", "emoji": "❄️",
        "color1": "#0ea5e9", "color2": "#0c4a6e",
        "outcomes": [("Да", 0.72), ("Нет", 0.28)],
        "resolves_at": "2026-11-01T23:59:00",
    },
    {
        "title": "Лето 2026 в Москве побьёт температурный рекорд?",
        "description": "Максимальная температура в Москве летом 2026 превысит 38.2°C (рекорд 2010 года).",
        "category": "weather", "emoji": "☀️",
        "color1": "#f59e0b", "color2": "#92400e",
        "outcomes": [("Побьёт", 0.28), ("Нет", 0.72)],
        "resolves_at": "2026-08-31T23:59:00",
    },
]


# ---------- runtime API ----------

def _load_version(session: Session) -> str:
    """Read the seed version marker. Returns empty string if not present."""
    from sqlalchemy import text  # local import to avoid surfacing in module API
    try:
        row = session.exec(  # type: ignore[arg-type]
            text("SELECT value FROM kv_meta WHERE key='seed_version'")
        ).first()
    except Exception:
        return ""
    if not row:
        return ""
    return row[0] if isinstance(row, tuple) else str(row)


def _save_version(session: Session, ver: str) -> None:
    from sqlalchemy import text
    session.exec(text("CREATE TABLE IF NOT EXISTS kv_meta (key TEXT PRIMARY KEY, value TEXT)"))  # type: ignore[arg-type]
    session.exec(  # type: ignore[arg-type]
        text("INSERT INTO kv_meta(key,value) VALUES('seed_version', :v) "
             "ON CONFLICT(key) DO UPDATE SET value=excluded.value").bindparams(v=ver)
    )
    session.commit()


def _wipe_seed_events(session: Session) -> int:
    """Remove all source='seed' events along with their outcomes and any bets/legs that reference them."""
    seed_events = session.exec(select(Event).where(Event.source == "seed")).all()
    seed_event_ids = {e.id for e in seed_events}
    if not seed_event_ids:
        return 0

    # Delete bet legs referencing those events.
    legs = session.exec(select(BetLeg).where(BetLeg.event_id.in_(seed_event_ids))).all()  # type: ignore[attr-defined]
    affected_bet_ids = {l.bet_id for l in legs}
    for l in legs:
        session.delete(l)
    # Delete the bets that lost all their legs (since legs are now gone).
    for b in session.exec(select(Bet).where(Bet.id.in_(affected_bet_ids))).all():  # type: ignore[attr-defined]
        session.delete(b)
    # Delete outcomes.
    for o in session.exec(select(Outcome).where(Outcome.event_id.in_(seed_event_ids))).all():  # type: ignore[attr-defined]
        session.delete(o)
    # Delete events.
    for e in seed_events:
        session.delete(e)
    session.commit()
    return len(seed_event_ids)


def _insert_seed(session: Session) -> int:
    added = 0
    for s in SEED_EVENTS:
        # Idempotent: if a seed event with this exact title already exists, skip.
        existing = session.exec(
            select(Event).where(Event.source == "seed", Event.title == s["title"])
        ).first()
        if existing:
            continue
        event = Event(
            owner_id=None,
            title=s["title"],
            description=s["description"],
            category=s["category"],
            emoji=s["emoji"],
            color1=s["color1"],
            color2=s["color2"],
            source="seed",
            resolves_at=_d(s["resolves_at"]) if s.get("resolves_at") else None,
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


def seed_if_empty(session: Session) -> int:
    """Idempotent seeding.

    - First start (no events at all): seed the catalogue.
    - DB has events but seed_version marker is missing or stale: wipe old
      `source='seed'` events and replace with the new catalogue.
    - Marker is current: noop.
    """
    current = _load_version(session)
    if current == SEED_VERSION:
        return 0
    has_any = session.exec(select(Event).limit(1)).first()
    if has_any:
        _wipe_seed_events(session)
    added = _insert_seed(session)
    _save_version(session, SEED_VERSION)
    return added
