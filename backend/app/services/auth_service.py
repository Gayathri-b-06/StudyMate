"""Authentication service for StudyMate.

Handles user creation, credential validation, and session tokens.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import os
from typing import Optional
from uuid import uuid4

from sqlalchemy.orm import Session

from app.config import DEFAULT_USER_ID
from app.db.models import User, UserSession


def generate_salt() -> str:
    """Generate a random 16-byte hex-encoded salt."""
    return os.urandom(16).hex()


def hash_password(password: str, salt_hex: str) -> str:
    """Hash password with salt using SHA-256 matching the frontend web crypto implementation."""
    salt_bytes = bytes.fromhex(salt_hex)
    combined = salt_bytes + password.encode("utf-8")
    return hashlib.sha256(combined).hexdigest()


def verify_password(password: str, salt_hex: str, expected_hash: str) -> bool:
    """Verify plaintext password against stored salt and hash."""
    return hash_password(password, salt_hex) == expected_hash


def create_user(
    db: Session,
    *,
    name: str,
    email: str,
    password: str,
    role: str = "student",
    is_demo: bool = False,
    user_id: Optional[str] = None,
) -> User:
    """Create and persist a new User."""
    normalized_email = email.strip().lower()
    salt = generate_salt()
    pw_hash = hash_password(password, salt)
    uid = user_id or f"usr_{uuid4().hex[:16]}"

    user = User(
        id=uid,
        email=normalized_email,
        name=name.strip(),
        password_hash=pw_hash,
        salt=salt,
        role=role,
        is_demo=is_demo,
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_session(db: Session, user_id: str) -> str:
    """Generate a session token and persist it for user_id."""
    token = f"tok_{uuid4().hex}"
    session = UserSession(
        token=token,
        user_id=user_id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(session)
    db.commit()
    return token


def authenticate_user(
    db: Session,
    email: str,
    password: str,
) -> tuple[Optional[User], Optional[str]]:
    """Verify credentials; return (user, token) or (None, None)."""
    normalized_email = email.strip().lower()
    user = db.query(User).filter(User.email == normalized_email).first()
    if not user or not can_authenticate(user):
        return None, None
    if not verify_password(password, user.salt, user.password_hash):
        return None, None
    token = create_session(db, user.id)
    return user, token


def get_user_by_token(db: Session, token: str) -> Optional[User]:
    """Look up user by active session token."""
    session = db.get(UserSession, token)
    if not session:
        return None
    user = session.user
    return user if user is not None and can_authenticate(user) else None


def delete_session(db: Session, token: str) -> None:
    """Remove a session token (logout)."""
    session = db.get(UserSession, token)
    if session:
        db.delete(session)
        db.commit()


def can_authenticate(user: User) -> bool:
    """Legacy/demo records are ownership placeholders, never login identities."""
    return user.id != DEFAULT_USER_ID and not user.is_demo


def seed_default_user(db: Session) -> User:
    """Preserve legacy ownership without creating a usable demo/admin login."""
    default_user = db.get(User, DEFAULT_USER_ID)
    if not default_user:
        salt = generate_salt()
        pw_hash = hash_password(os.urandom(32).hex(), salt)
        default_user = User(
            id=DEFAULT_USER_ID,
            email="demo@studymate.ai",
            name="Demo Student",
            password_hash=pw_hash,
            salt=salt,
            role="student",
            is_demo=True,
            created_at=datetime.now(timezone.utc),
        )
        db.add(default_user)
        db.commit()
        db.refresh(default_user)
    return default_user
