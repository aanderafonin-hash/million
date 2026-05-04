from typing import Iterable

from ..config import settings


def prob_to_odds(p: float) -> float:
    """Convert true probability to bookmaker odds with margin."""
    eff = max(1e-6, p * (1 - settings.margin))
    return max(1.01, round(1.0 / eff, 2))


def normalize_probabilities(probs: Iterable[float]) -> list[float]:
    arr = [max(1e-6, float(x)) for x in probs]
    s = sum(arr)
    return [x / s for x in arr]
