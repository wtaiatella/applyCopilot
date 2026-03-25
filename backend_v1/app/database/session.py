import os
from sqlmodel import create_engine, Session, SQLModel
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./applycopilot.db"
    GOOGLE_API_KEY: str = ""
    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()

engine = create_engine(settings.DATABASE_URL, echo=True if os.getenv("ENV") == "development" else False)

def init_db():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
