from fastapi import Header, HTTPException
from app.utils.jwt_utils import verify_token


async def get_current_user(authorization: str = Header(default="")):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    token = authorization[7:]
    try:
        payload = verify_token(token)
        return {
            "userId": payload.get("userId"),
            "email": payload.get("email"),
            "isAdmin": payload.get("isAdmin", False),
        }
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
