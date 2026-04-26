from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BETSLIFE_", env_file=".env", extra="ignore")

    db_path: str = "/data/betslife.db"
    jwt_secret: str = "dev-secret-change-me-in-prod-please"
    jwt_alg: str = "HS256"
    jwt_ttl_hours: int = 24 * 30  # 30 days
    starting_balance: float = 10000.0
    margin: float = 0.05
    cors_origins: list[str] = ["*"]
    sportsdb_key: str = "3"  # public free key
    auto_resolve_interval_sec: int = 60
    site_name: str = "BetLife"


settings = Settings()
