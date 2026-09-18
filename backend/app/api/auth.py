"""FastAPI router for User Authentication (signup, login, logout, me)."""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


class SignupRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., min_length=3, max_length=320, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    password: str = Field(..., min_length=6)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    password: str = Field(..., min_length=1)


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    is_demo: bool

    @classmethod
    def from_orm(cls, user: User) -> "UserResponse":
        return cls(
            id=user.id,
            email=user.email,
            name=user.name,
            role=user.role,
            is_demo=user.is_demo,
        )


class AuthResponse(BaseModel):
    user: UserResponse
    token: str


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(body: SignupRequest, db: Session = Depends(get_db)) -> AuthResponse:
    """Register a new student user."""
    normalized_email = body.email.strip().lower()
    existing = db.query(User).filter(User.email == normalized_email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists.",
        )

    user = auth_service.create_user(
        db,
        name=body.name,
        email=normalized_email,
        password=body.password,
        role="student",
        is_demo=False,
    )
    token = auth_service.create_session(db, user.id)
    return AuthResponse(user=UserResponse.from_orm(user), token=token)


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    """Authenticate user with email and password."""
    user, token = auth_service.authenticate_user(db, body.email, body.password)
    if not user or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    return AuthResponse(user=UserResponse.from_orm(user), token=token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    current_user: User = Depends(get_current_user),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> None:
    """Revoke active session token."""
    # get_current_user has already validated the scheme and token.
    auth_service.delete_session(db, authorization.split()[1])


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    """Return profile of the currently authenticated user."""
    return UserResponse.from_orm(current_user)
