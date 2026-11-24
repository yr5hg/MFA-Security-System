
from contextlib import asynccontextmanager

from fastapi import FastAPI
from backend.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Voice Verification Security System",
    description="Backend API for password and voice-based MFA",
    version="0.1.0",
    lifespan=lifespan
)


@app.get("/health")
def health_check():
    return {"status": "ok"}
