
import hashlib
import json
import secrets
import time
from contextlib import closing

from backend.database import connect_db


SESSION_TTL_SECONDS = 30 * 60


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(user_id, username, roles):
    session_token = secrets.token_urlsafe(32)
    csrf_token = secrets.token_urlsafe(32)

    created_at = int(time.time())
    expires_at = created_at + SESSION_TTL_SECONDS

    with closing(connect_db()) as connection:
        with connection:
            connection.execute("""
                INSERT INTO sessions (
                    session_id_hash,
                    user_id,
                    username,
                    roles_json,
                    voice_verified_version,
                    csrf_token_hash,
                    created_at,
                    expires_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                hash_token(session_token),
                user_id,
                username,
                json.dumps(roles),
                None,
                hash_token(csrf_token),
                created_at,
                expires_at
            ))

    return session_token, csrf_token


def get_session(session_token):
    if not session_token:
        return None

    with closing(connect_db()) as connection:
        session = connection.execute("""
            SELECT * FROM sessions
            WHERE session_id_hash = ?
            AND expires_at > ?
        """, (
            hash_token(session_token),
            int(time.time())
        )).fetchone()

    if session is None:
        return None

    return dict(session)


def validate_csrf(session, csrf_token):
    if not session or not csrf_token:
        return False

    return secrets.compare_digest(
        session["csrf_token_hash"],
        hash_token(csrf_token)
    )


def delete_session(session_token):
    if not session_token:
        return

    with closing(connect_db()) as connection:
        with connection:
            connection.execute("""
                DELETE FROM sessions
                WHERE session_id_hash = ?
            """, (hash_token(session_token),))
