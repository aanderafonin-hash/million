"""Avatar + stream media uploads, served back as static files."""
import io
import logging
import os
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image, ImageOps
from sqlmodel import Session

from ..auth import get_current_user
from ..config import settings
from ..db import get_session
from ..models import User
from .auth_router import _user_to_out
from ..schemas import UserOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

AVATARS_DIR = os.path.join(settings.uploads_dir, "avatars")
STREAMS_DIR = os.path.join(settings.uploads_dir, "streams")
os.makedirs(AVATARS_DIR, exist_ok=True)
os.makedirs(STREAMS_DIR, exist_ok=True)

ALLOWED_IMAGE_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_VIDEO_MIME = {"video/mp4", "video/webm"}


def _read_capped(file: UploadFile, max_bytes: int) -> bytes:
    data = file.file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail="file too large")
    return data


@router.post("/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> UserOut:
    if file.content_type not in ALLOWED_IMAGE_MIME:
        raise HTTPException(status_code=400, detail="unsupported image type")
    raw = _read_capped(file, settings.avatar_max_bytes)
    try:
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGBA")
        img.thumbnail((512, 512), Image.LANCZOS)
        # Square crop centered
        size = min(img.width, img.height)
        left = (img.width - size) // 2
        top = (img.height - size) // 2
        img = img.crop((left, top, left + size, top + size))
        img = img.resize((256, 256), Image.LANCZOS)
    except Exception as e:
        logger.warning("invalid image: %s", e)
        raise HTTPException(status_code=400, detail="invalid image")

    name = f"{user.id}-{secrets.token_hex(6)}.png"
    path = os.path.join(AVATARS_DIR, name)
    img.save(path, format="PNG", optimize=True)

    # delete previous avatar file (if it lived under our dir)
    prev = user.avatar_url
    user.avatar_url = f"/uploads/avatars/{name}"
    session.add(user)
    session.commit()
    session.refresh(user)
    if prev and prev.startswith("/uploads/avatars/"):
        try:
            os.remove(os.path.join(settings.uploads_dir, prev[len("/uploads/"):]))
        except OSError:
            pass
    return _user_to_out(user)


@router.delete("/avatar", response_model=UserOut)
def delete_avatar(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> UserOut:
    prev = user.avatar_url
    user.avatar_url = None
    session.add(user)
    session.commit()
    session.refresh(user)
    if prev and prev.startswith("/uploads/avatars/"):
        try:
            os.remove(os.path.join(settings.uploads_dir, prev[len("/uploads/"):]))
        except OSError:
            pass
    return _user_to_out(user)


@router.post("/stream")
async def upload_stream_media(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
) -> dict:
    if file.content_type not in ALLOWED_VIDEO_MIME:
        raise HTTPException(status_code=400, detail="unsupported video type")
    raw = _read_capped(file, settings.stream_max_bytes)
    ext = "mp4" if file.content_type == "video/mp4" else "webm"
    name = f"{user.id}-{secrets.token_hex(8)}.{ext}"
    path = os.path.join(STREAMS_DIR, name)
    with open(path, "wb") as f:
        f.write(raw)
    return {
        "media_url": f"/uploads/streams/{name}",
        "media_type": "mp4" if ext == "mp4" else "webm",
        "size_bytes": len(raw),
    }


def get_uploads_dir() -> Optional[str]:
    return settings.uploads_dir
