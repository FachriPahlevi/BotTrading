import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    postgres_host = os.getenv("POSTGRES_HOST")
    if postgres_host:
        postgres_user = os.getenv("POSTGRES_USER", "postgres")
        postgres_password = os.getenv("POSTGRES_PASSWORD", "postgres")
        postgres_port = os.getenv("POSTGRES_PORT", "5432")
        postgres_db = os.getenv("POSTGRES_DB", "ai_trading")
        DATABASE_URL = (
            f"postgresql+psycopg2://{postgres_user}:{postgres_password}@{postgres_host}:"
            f"{postgres_port}/{postgres_db}"
        )
    else:
        db_path = Path(__file__).resolve().parent.parent.parent / "ai_trading.db"
        DATABASE_URL = f"sqlite:///{db_path}"

SQLALCHEMY_DATABASE_URL = DATABASE_URL

connect_args = {"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
