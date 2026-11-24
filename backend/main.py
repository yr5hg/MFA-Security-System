
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from backend.database import init_db
from backend.authorization import (
    get_current_session,
    get_user_status
)


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


@app.get("/api/me")
def get_me(request: Request):
    session = get_current_session(request)

    if session is None:
        return JSONResponse(
            status_code=401,
            content={
                "error": {
                    "code": "UNAUTHENTICATED",
                    "message": "Authentication is required."
                }
            }
        )

    return get_user_status(session)
