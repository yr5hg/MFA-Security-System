
import sqlite3
from contextlib import closing

from backend.config import (
    DATA_DIR,
    DATABASE_PATH,
    VOICE_STORAGE_DIR
)


def connect_db():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    VOICE_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    with closing(connect_db()) as connection:
        with connection:
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id_hash TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    username TEXT NOT NULL,
                    roles_json TEXT NOT NULL,
                    voice_verified_version INTEGER,
                    csrf_token_hash TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS voice_enrollments (
                    user_id TEXT PRIMARY KEY,
                    reference_path TEXT,
                    version INTEGER NOT NULL DEFAULT 1,
                    updated_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS enrollment_approvals (
                    approval_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    approved_by TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL,
                    consumed_at INTEGER,
                    revoked_at INTEGER
                );
            """)
