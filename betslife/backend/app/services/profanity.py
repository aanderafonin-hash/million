"""Simple profanity filter — masks common Russian/English bad words.

Not a comprehensive solution, but good enough for a casual chat.
"""
import re

# Stems (lowercase). Match as substring after stripping non-letter chars.
PROFANITY_STEMS = [
    "fuck", "shit", "bitch", "asshole", "cunt", "dick", "bastard",
    "nigger", "nigga", "faggot",
    # ru cyrillic stems
    "хуй", "хуе", "хуя", "хуи", "хуё",
    "пизд", "пизж",
    "ебат", "ебут", "ебал", "ебан", "ебал", "ебуч", "ебиш", "ебло", "еби", "ебё",
    "блядь", "бляд", "блять",
    "сук", "сучк", "сучар",
    "пидор", "пидар", "пидр",
    "хер", "херн", "херов",
    "мудак", "мудил", "мудоз",
    "говн", "гавн",
]


def _normalize(text: str) -> str:
    return re.sub(r"[^a-zа-яё]+", "", text.lower())


def contains_profanity(text: str) -> bool:
    flat = _normalize(text)
    return any(stem in flat for stem in PROFANITY_STEMS)


def censor(text: str) -> str:
    """Replace any token containing profanity with asterisks of equal length."""
    parts = re.split(r"(\s+)", text)
    out: list[str] = []
    for p in parts:
        if not p.strip():
            out.append(p)
            continue
        flat = _normalize(p)
        if any(stem in flat for stem in PROFANITY_STEMS):
            out.append("*" * max(2, len(p)))
        else:
            out.append(p)
    return "".join(out)
