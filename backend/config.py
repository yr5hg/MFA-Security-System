
import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")

# Keycloak configuration
KEYCLOAK_URL = os.getenv("KEYCLOAK_URL", "http://localhost:8080")
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "voice-demo")
KEYCLOAK_CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID", "voice-web")

# Backend configuration
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

# Voice service configuration
VOICE_SERVICE_URL = os.getenv(
    "VOICE_SERVICE_URL", "http://127.0.0.1:8001"
)

# Local storage outside the repository
LOCAL_DATA = Path(
    os.getenv("LOCALAPPDATA", str(Path.home() / ".local" / "share"))
)

DATA_DIR = LOCAL_DATA / "VoiceVerificationSystem"
DATABASE_PATH = DATA_DIR / "app.db"
VOICE_STORAGE_DIR = DATA_DIR / "recordings"
