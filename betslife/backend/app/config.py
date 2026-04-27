from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BETSLIFE_", env_file=".env", extra="ignore")

    db_path: str = "/data/betslife.db"
    uploads_dir: str = "/data/uploads"
    jwt_secret: str = "dev-secret-change-me-in-prod-please"
    jwt_alg: str = "HS256"
    jwt_ttl_hours: int = 24 * 30  # 30 days
    starting_balance: float = 10000.0
    margin: float = 0.05
    cors_origins: list[str] = ["*"]
    sportsdb_key: str = "3"  # public free key
    auto_resolve_interval_sec: int = 60
    site_name: str = "BetLife"
    # First admin: when this username registers (or already exists) it gets is_admin=true.
    initial_admin_username: str = "e2e_andrey"
    chat_min_interval_sec: float = 2.0
    avatar_max_bytes: int = 5 * 1024 * 1024  # 5 MB
    stream_max_bytes: int = 50 * 1024 * 1024  # 50 MB


settings = Settings()
