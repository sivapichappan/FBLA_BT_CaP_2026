"""Concierge routes. Thin layer (§5); requires auth (chats persist per user)."""

from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.middleware.security import current_user
from app.repositories import chat as chat_repo
from app.services import concierge

router = APIRouter(prefix="/ai", tags=["ai"])


class ChatIn(BaseModel):
    # Length-capped (syntactic, §12) so a paste-bomb can't blow up the pipeline.
    message: Annotated[str, Field(min_length=1, max_length=500)]
    session_id: Optional[int] = None
    lat: Optional[Annotated[float, Field(ge=-90, le=90)]] = None
    lng: Optional[Annotated[float, Field(ge=-180, le=180)]] = None


@router.post("/chat")
async def chat(body: ChatIn, user: dict = Depends(current_user)) -> dict:
    return await concierge.chat(user, body.message, body.session_id, body.lat, body.lng)


@router.get("/sessions/{session_id}")
async def session_history(session_id: int, user: dict = Depends(current_user)) -> dict:
    session = chat_repo.get_session(session_id, user["id"])
    if not session:
        return {"session_id": None, "messages": []}
    return {"session_id": session_id, "messages": chat_repo.recent_messages(session_id, limit=50)}
