import logging
import os
from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from .config import settings

logger = logging.getLogger(__name__)

_db_path = settings.db_path
os.makedirs(os.path.dirname(_db_path) or ".", exist_ok=True)

engine = create_engine(
    f"sqlite:///{_db_path}",
    echo=False,
    connect_args={"check_same_thread": False},
)


# Columns added after the initial schema. SQLite won't add columns automatically
# when SQLModel.metadata.create_all() runs against an existing table — we have
# to ALTER TABLE manually. Each entry is (table, column, sql-fragment).
ADDITIVE_COLUMNS: list[tuple[str, str, str]] = [
    ("user", "email", 'TEXT'),
    ("user", "avatar_url", 'TEXT'),
    ("user", "is_admin", 'INTEGER NOT NULL DEFAULT 0'),
    ("user", "is_moderator", 'INTEGER NOT NULL DEFAULT 0'),
    ("user", "is_banned", 'INTEGER NOT NULL DEFAULT 0'),
    ("user", "ban_reason", 'TEXT'),
    ("user", "chat_muted_until", 'TIMESTAMP'),
    ("user", "last_chat_at", 'TIMESTAMP'),
    ("stream", "media_url", 'TEXT'),
    ("stream", "media_type", 'TEXT'),
    ("chatmessage", "is_deleted", 'INTEGER NOT NULL DEFAULT 0'),
]


def _apply_additive_migrations() -> None:
    insp = inspect(engine)
    existing_tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table, column, fragment in ADDITIVE_COLUMNS:
            if table not in existing_tables:
                continue
            cols = {c["name"] for c in insp.get_columns(table)}
            if column in cols:
                continue
            try:
                conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN {column} {fragment}'))
                logger.info("migrated %s.%s", table, column)
            except Exception as e:
                logger.warning("could not add %s.%s: %s", table, column, e)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _apply_additive_migrations()


@contextmanager
def session_scope() -> Iterator[Session]:
    session = Session(engine)
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_session() -> Iterator[Session]:
    with session_scope() as session:
        yield session
