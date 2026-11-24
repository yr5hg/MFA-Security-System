
from fastapi import FastAPI

app = FastAPI(
    title="Voice Verification Security System",
    description="Backend API for password and voice-based MFA",
    version="0.1.0"
)


@app.get("/health")
def health_check():
    return {"status": "ok"}
