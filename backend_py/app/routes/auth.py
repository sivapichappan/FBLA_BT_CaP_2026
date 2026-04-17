import re
import math
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
import bcrypt

from app.config.database import query
from app.utils.jwt_utils import generate_token
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import limiter, AUTH_LIMIT

router = APIRouter(prefix="/api/auth", tags=["auth"])

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


def _generate_username(email: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9_]", "", email.split("@")[0])[:20]
    return f"{base}{math.floor(__import__('random').random() * 10000)}"


# --- Models ---

class RegisterBody(BaseModel):
    email: EmailStr
    password: str
    firstName: str | None = None
    lastName: str | None = None
    username: str | None = None


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class LocationBody(BaseModel):
    latitude: float
    longitude: float
    city: str | None = None
    state: str | None = None


# --- Routes ---

@router.post("/register")
@limiter.limit(AUTH_LIMIT)
async def register(request: Request, body: RegisterBody):
    try:
        existing = query("SELECT id FROM users WHERE email = $1", [body.email])
        if existing["rows"]:
            raise HTTPException(status_code=400, detail="Email already registered")

        final_username = body.username or _generate_username(body.email)
        existing_username = query("SELECT id FROM users WHERE username = $1", [final_username])
        if existing_username["rows"]:
            final_username = _generate_username(body.email)

        password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt(10)).decode()

        result = query(
            """INSERT INTO users (
                 email, username, password_hash, first_name, last_name,
                 trust_score, total_points, level, is_active, is_admin
               )
               VALUES ($1, $2, $3, $4, $5, 50.0, 0, 1, true, false)
               RETURNING id, email, username, first_name, last_name, is_admin, created_at""",
            [body.email, final_username, password_hash, body.firstName, body.lastName],
        )

        user = result["rows"][0]
        token = generate_token({
            "userId": user["id"],
            "email": user["email"],
            "isAdmin": user["is_admin"],
        })

        return {
            "message": "User registered successfully",
            "token": token,
            "user": {
                "id": user["id"],
                "email": user["email"],
                "username": user["username"],
                "firstName": user["first_name"],
                "lastName": user["last_name"],
                "isAdmin": user["is_admin"],
                "createdAt": str(user["created_at"]),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Registration error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/login")
@limiter.limit(AUTH_LIMIT)
async def login(request: Request, body: LoginBody):
    try:
        result = query(
            """SELECT id, email, username, password_hash, first_name, last_name, is_admin,
                      failed_login_attempts, locked_until, is_active
               FROM users WHERE email = $1""",
            [body.email],
        )

        if not result["rows"]:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        user = result["rows"][0]

        if not user["is_active"]:
            raise HTTPException(status_code=403, detail="Account is disabled")

        if user["locked_until"] and user["locked_until"] > datetime.now(timezone.utc):
            raise HTTPException(status_code=423, detail="Account temporarily locked. Try again later.")

        is_valid = bcrypt.checkpw(body.password.encode(), user["password_hash"].encode())

        if not is_valid:
            new_attempts = (user["failed_login_attempts"] or 0) + 1
            should_lock = new_attempts >= MAX_FAILED_ATTEMPTS
            lock_until = (datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)) if should_lock else None
            query(
                "UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3",
                [new_attempts, lock_until, user["id"]],
            )
            raise HTTPException(status_code=401, detail="Invalid credentials")

        query(
            "UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1",
            [user["id"]],
        )

        token = generate_token({
            "userId": user["id"],
            "email": user["email"],
            "isAdmin": user["is_admin"],
        })

        return {
            "message": "Login successful",
            "token": token,
            "user": {
                "id": user["id"],
                "email": user["email"],
                "username": user["username"],
                "firstName": user["first_name"],
                "lastName": user["last_name"],
                "isAdmin": user["is_admin"],
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Login error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    try:
        result = query(
            """SELECT id, email, username, first_name, last_name, profile_image_url,
                      default_latitude, default_longitude, default_city, default_state,
                      trust_score, total_points, level, is_admin, created_at, last_login_at
               FROM users WHERE id = $1""",
            [user["userId"]],
        )

        if not result["rows"]:
            raise HTTPException(status_code=404, detail="User not found")

        return {"user": result["rows"][0]}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Get profile error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/location")
async def update_location(body: LocationBody, user: dict = Depends(get_current_user)):
    try:
        query(
            """UPDATE users
               SET default_latitude = $1, default_longitude = $2,
                   default_city = COALESCE($3, default_city),
                   default_state = COALESCE($4, default_state)
               WHERE id = $5""",
            [body.latitude, body.longitude, body.city, body.state, user["userId"]],
        )
        return {"message": "Location updated successfully"}
    except Exception as e:
        print(f"Update location error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
