import os
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    GOOGLE_API_KEY: str
    DATABASE_URL: str = "sqlite:///./applycopilot.db"
    ENV: str = "development"
    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()

def get_llm(model: str = "gemini-1.5-flash"):
    return ChatGoogleGenerativeAI(
        model=model,
        google_api_key=settings.GOOGLE_API_KEY,
        temperature=0,
    )
