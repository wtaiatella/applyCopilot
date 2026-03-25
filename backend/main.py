from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.auth import router as auth_router
from app.api.cv import router as cv_router
from app.api.profile import router as profile_router
from app.api.rag import router as rag_router

app = FastAPI(
    title="ApplyCopilot API",
    description="API for ApplyCopilot - Intelligent Job Search System",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(cv_router)
app.include_router(profile_router)
app.include_router(rag_router)

@app.get("/")
async def root():
    return {"message": "ApplyCopilot API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
