from __future__ import annotations

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.pricing import process_upload

app = FastAPI(
    title="Pricing Items API",
    description="Upload a list of order items (CSV/XLSX) and get cost per line.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_BYTES = 25 * 1024 * 1024


@app.get("/api/health")
def health() -> dict:
    from pathlib import Path

    catalog = Path(
        __import__("os").environ.get("CATALOG_PATH", "/data/all_orders_merged.csv")
    )
    return {
        "status": "ok",
        "catalog": catalog.name if catalog.is_file() else None,
        "catalog_ok": catalog.is_file(),
    }


@app.post("/api/price")
async def price_file(file: UploadFile = File(...)) -> dict:
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
