import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.database.models import RoleEnum


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    role: RoleEnum
    is_verified: bool


class TokenPair(BaseModel):
    access_token: str
    token_type: str = "bearer"
