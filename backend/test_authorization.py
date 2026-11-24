
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


    def prepare_user(
        self,
        role,
        enrollment_version=None,
        verified_version=None
    ):
        token, _ = create_session(
            "rbac-test-sub",
            "rbac_test_user",
            [role]
        )

        with closing(database.connect_db()) as connection:
            with connection:
                if enrollment_version is not None:
                    connection.execute("""
                        INSERT INTO voice_enrollments (
                            user_id,
                            reference_path,
                            version,
                            updated_at
                        )
                        VALUES (?, ?, ?, ?)
                    """, (
                        "rbac-test-sub",
                        "test-reference.wav",
                        enrollment_version,
                        int(time.time())
                    ))

                connection.execute("""
                    UPDATE sessions
                    SET voice_verified_version = ?
                    WHERE session_id_hash = ?
                """, (
                    verified_version,
                    hash_token(token)
                ))

        self.client.cookies.set("voice_session", token)

    def test_protected_without_session(self):
        self.assertEqual(
            self.client.get("/api/protected").status_code, 401
        )
        self.assertEqual(
            self.client.get("/api/admin").status_code, 401
        )

    def test_regular_user_without_voice(self):
        self.prepare_user("regular_user", 1, None)

        self.assertEqual(
            self.client.get("/api/protected").status_code, 403
        )
        self.assertEqual(
            self.client.get("/api/admin").status_code, 403
        )

    def test_admin_without_voice(self):
        self.prepare_user("administrator", 1, None)

        self.assertEqual(
            self.client.get("/api/protected").status_code, 403
        )
        self.assertEqual(
            self.client.get("/api/admin").status_code, 403
        )

    def test_verified_regular_user(self):
        self.prepare_user("regular_user", 1, 1)

        self.assertEqual(
            self.client.get("/api/protected").status_code, 200
        )
        self.assertEqual(
            self.client.get("/api/admin").status_code, 403
        )

    def test_verified_administrator(self):
        self.prepare_user("administrator", 1, 1)

        self.assertEqual(
            self.client.get("/api/protected").status_code, 200
        )
        self.assertEqual(
            self.client.get("/api/admin").status_code, 200
        )

    def test_old_voice_enrollment_version(self):
        self.prepare_user("administrator", 2, 1)

        self.assertEqual(
            self.client.get("/api/protected").status_code, 403
        )
        self.assertEqual(
            self.client.get("/api/admin").status_code, 403
        )

    def test_unknown_role(self):
        self.prepare_user("unknown_role", 1, 1)

        self.assertEqual(
            self.client.get("/api/protected").status_code, 403
        )
        self.assertEqual(
            self.client.get("/api/admin").status_code, 403
        )

if __name__ == "__main__":
    unittest.main()
