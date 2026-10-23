"""Cookie login using AUTH_EMAIL / AUTH_PASSWORD from the environment."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import time

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field

COOKIE_NAME = "pricing_session"
TTL_SECONDS = 7 * 24 * 60 * 60


class LoginBody(BaseModel):
    email: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=256)


def auth_configured() -> bool:
    return bool(os.environ.get("AUTH_EMAIL", "").strip() and os.environ.get("AUTH_PASSWORD", ""))


def expected_email() -> str:
    return os.environ.get("AUTH_EMAIL", "").strip().lower()


def _secret() -> bytes:
    secret = os.environ.get("AUTH_SECRET", "").strip()
    if not secret:
        secret = os.environ.get("AUTH_PASSWORD", "") + "|pricing-items-auth"
    return secret.encode()


def verify_credentials(email: str, password: str) -> bool:
    wanted_email = expected_email()
    wanted_password = os.environ.get("AUTH_PASSWORD", "")
    if not wanted_email or not wanted_password:
        return False
    email_ok = hmac.compare_digest(email.strip().lower(), wanted_email)
    password_ok = hmac.compare_digest(password, wanted_password)
    return email_ok and password_ok


def issue_token(email: str) -> str:
    payload = f"{int(time.time()) + TTL_SECONDS}.{email.strip().lower()}"
    payload_b64 = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    sig = hmac.new(_secret(), payload_b64.encode(), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{sig}"


def parse_token(token: str) -> str | None:
    if not token or "." not in token:
        return None
    payload_b64, sig = token.split(".", 1)
    expected = hmac.new(_secret(), payload_b64.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    pad = "=" * (-len(payload_b64) % 4)
    try:
        payload = base64.urlsafe_b64decode(payload_b64 + pad).decode()
        exp_s, email = payload.split(".", 1)
    except (ValueError, UnicodeDecodeError):
        return None
    try:
        if int(exp_s) < time.time():
            return None
    except ValueError:
        return None
    wanted = expected_email()
    if not wanted or not hmac.compare_digest(email, wanted):
        return None
    return email


def cookie_secure(request: Request) -> bool:
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    return proto.split(",")[0].strip().lower() == "https"


def require_session(request: Request) -> str:
    if not auth_configured():
        raise HTTPException(
            status_code=503,
            detail="Set AUTH_EMAIL and AUTH_PASSWORD in Coolify environment variables",
        )
    email = parse_token(request.cookies.get(COOKIE_NAME) or "")
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return email
