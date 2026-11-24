
import json
from contextlib import closing

from backend.database import connect_db
from backend.sessions import get_session


SESSION_COOKIE_NAME = "voice_session"


def get_current_session(request):
    session_token = request.cookies.get(SESSION_COOKIE_NAME)
    return get_session(session_token)


def get_user_status(session):
    with closing(connect_db()) as connection:
        enrollment = connection.execute("""
            SELECT reference_path, version
            FROM voice_enrollments
            WHERE user_id = ?
        """, (session["user_id"],)).fetchone()

    voice_enrolled = (
        enrollment is not None
        and bool(enrollment["reference_path"])
    )

    voice_verified = (
        voice_enrolled
        and session["voice_verified_version"] == enrollment["version"]
    )

    return {
        "user_id": session["user_id"],
        "username": session["username"],
        "roles": json.loads(session["roles_json"]),
        "voice_enrolled": voice_enrolled,
        "voice_verified": voice_verified
    }

def check_access(session, required_roles):
    if session is None:
        return 401, "UNAUTHENTICATED", "Authentication is required."

    status = get_user_status(session)

    if not status["voice_verified"]:
        return 403, "VOICE_NOT_VERIFIED", "Voice verification is required."

    if not any(role in status["roles"] for role in required_roles):
        return 403, "FORBIDDEN", "Insufficient permissions."

    return None
