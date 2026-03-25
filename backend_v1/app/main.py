from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import init_db
from .api.jobs import router as jobs_router
from .api.profile import router as profile_router

app = FastAPI(
    title="ApplyCopilot API",
    description="Backend API for ApplyCopilot - AI-Powered Job Application Manager",
    version="0.1.0"
)

@app.on_event("startup")
def on_startup():
    init_db()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(jobs_router)
app.include_router(profile_router)

@app.get("/")
async def root():
    return {"message": "Welcome to ApplyCopilot API"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
