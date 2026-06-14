import os
import jwt
from datetime import datetime, timedelta, timezone

SECRET = os.getenv("JWT_SECRET", "default-secret-change-in-production")


def generate_token(payload: dict) -> str:
    data = {
        **payload,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(data, SECRET, algorithm="HS256")


def verify_token(token: str) -> dict:
    return jwt.decode(token, SECRET, algorithms=["HS256"])


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET, algorithms=["HS256"], options={"verify_exp": False})
    except Exception:
        return None
