
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from contextlib import closing

from fastapi.testclient import TestClient

from backend import database
from backend.main import app
from backend.sessions import create_session, hash_token


class AuthorizationTests(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)

        path = Path(self.temp_dir.name)

        self.enterContext(patch.multiple(
            database,
            DATA_DIR=path,
            DATABASE_PATH=path / "test.db",
            VOICE_STORAGE_DIR=path / "recordings"
        ))

        self.client = self.enterContext(TestClient(app))

    def test_unauthenticated_user(self):
        response = self.client.get("/api/me")
        self.assertEqual(response.status_code, 401)

    def test_authenticated_user(self):
        token, _ = create_session(
            "test-sub",
            "test_user",
            ["regular_user"]
        )

        self.client.cookies.set("voice_session", token)

        response = self.client.get("/api/me")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["username"], "test_user")
        self.assertFalse(response.json()["voice_verified"])
        self.assertFalse(response.json()["voice_enrolled"])

    def test_expired_session(self):
        token, _ = create_session(
            "test-sub",
            "test_user",
            ["regular_user"]
        )

        with closing(database.connect_db()) as connection:
            with connection:
                connection.execute(
                    """
                    UPDATE sessions
                    SET expires_at = ?
                    WHERE session_id_hash = ?
                    """,
                    (int(time.time()) - 1, hash_token(token))
                )

        self.client.cookies.set("voice_session", token)

        response = self.client.get("/api/me")
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
