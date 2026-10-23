from __future__ import annotations

import os
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth import (
    COOKIE_NAME,
    TTL_SECONDS,
    LoginBody,
    auth_configured,
    cookie_secure,
    issue_token,
    require_session,
    verify_credentials,
)
from app.catalog import MatchMode, load_catalog, search_catalog
from app.pricing import process_upload

app = FastAPI(
    title="Pricing Items API",
    description="Upload a list of order items (CSV/XLSX) and get cost per line.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_BYTES = 25 * 1024 * 1024


def _set_session_cookie(response: JSONResponse, request: Request, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=cookie_secure(request),
        max_age=TTL_SECONDS,
        path="/",
    )


@app.get("/api/health")
def health() -> dict:
    catalog = Path(os.environ.get("CATALOG_PATH", "/data/all_orders_merged.csv"))
    return {
        "status": "ok",
        "catalog": catalog.name if catalog.is_file() else None,
        "catalog_ok": catalog.is_file(),
        "auth_configured": auth_configured(),
    }


@app.post("/api/login")
def login(body: LoginBody, request: Request) -> JSONResponse:
    if not auth_configured():
        raise HTTPException(
            status_code=503,
            detail="Set AUTH_EMAIL and AUTH_PASSWORD in Coolify environment variables",
        )
    if not verify_credentials(body.email, body.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    email = body.email.strip().lower()
    response = JSONResponse({"ok": True, "email": email})
    _set_session_cookie(response, request, issue_token(email))
    return response


@app.post("/api/logout")
def logout() -> JSONResponse:
    response = JSONResponse({"ok": True})
    response.delete_cookie(COOKIE_NAME, path="/")
    return response


@app.get("/api/me")
def me(email: str = Depends(require_session)) -> dict:
    return {"email": email}


@app.get("/api/search")
def search_products(
    q: str = Query("", max_length=200),
    mode: MatchMode = Query("fuzzy"),
    limit: int = Query(25, ge=1, le=100),
    _email: str = Depends(require_session),
) -> dict:
    query = q.strip()
    hits = search_catalog(query, mode=mode, limit=limit) if query else []
    return {
        "query": query,
        "mode": mode,
        "catalog_size": len(load_catalog()),
        "count": len(hits),
        "items": hits,
    }


@app.post("/api/price")
async def price_file(
    file: UploadFile = File(...),
    _email: str = Depends(require_session),
) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File is empty")
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 25MB)")

    try:
        result = process_upload(file.filename, content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"Could not parse file: {exc}") from exc

    return result
