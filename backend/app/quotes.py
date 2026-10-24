"""SQLite-backed quotations: draft → reviewed → issued."""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from app.calc import (
    LIABILITY_RULE,
    build_breakdown,
    default_extras,
    default_logistics,
    recalculate_quote,
    validate_for_issue,
)

DEFAULT_DB_PATH = Path(
    os.environ.get("QUOTES_DB_PATH", "/var/lib/pricing/quotes.db")
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _db_path() -> Path:
    path = Path(os.environ.get("QUOTES_DB_PATH", str(DEFAULT_DB_PATH)))
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(_db_path()), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS quotes (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                title TEXT,
                customer_name TEXT,
                currency TEXT NOT NULL DEFAULT 'USD',
                created_by TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                issued_at TEXT,
                payload TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_quotes_updated ON quotes(updated_at DESC)"
        )
        conn.commit()


class QuoteLineIn(BaseModel):
    line_no: int | str | None = None
    product_name: str | None = None
    quantity_units: float | None = 1.0
    gross_weight_kg: float | None = None
    usd_per_kg: float | None = None
    goods_cost_override: float | None = None
    pieces: list[dict[str, Any]] | None = None
    matched_product: str | None = None
    country_of_origin: str | None = None
    source_ref: str | None = None
    brand: str | None = None
    manufacturer: str | None = None
    order_id: str | None = None
    source_catalog_row: int | None = None


class QuoteCreate(BaseModel):
    title: str | None = None
    customer_name: str | None = None
    currency: str = "USD"
    source_filename: str | None = None
    match_mode: str | None = "strict"
    logistics: dict[str, Any] | None = None
    extras: list[dict[str, Any]] | None = None
    lines: list[QuoteLineIn] = Field(default_factory=list)
    # Optional: raw priced items from /api/price page
    priced_items: list[dict[str, Any]] | None = None


class QuotePatch(BaseModel):
    title: str | None = None
    customer_name: str | None = None
    status: str | None = None  # draft | reviewed (not issued via patch)
    logistics: dict[str, Any] | None = None
    extras: list[dict[str, Any]] | None = None
    lines: list[dict[str, Any]] | None = None


def _new_line_id() -> str:
    return uuid.uuid4().hex[:12]


def _line_from_priced(item: dict[str, Any], index: int) -> dict[str, Any]:
    qty = item.get("quantity_units")
    if qty in (None, 0):
        qty = 1.0
    return {
        "id": _new_line_id(),
        "line_no": item.get("line_no") or index,
        "product_name": item.get("product_name"),
        "quantity_units": qty,
        "gross_weight_kg": item.get("gross_weight_kg"),
        "usd_per_kg": item.get("price_per_kg") or item.get("usd_per_kg"),
        "goods_cost_override": None,
        "pieces": None,
        "matched_product": item.get("matched_product"),
        "country_of_origin": item.get("country_of_origin") or item.get("country"),
        "source_ref": item.get("source_ref"),
        "brand": item.get("brand"),
        "manufacturer": item.get("manufacturer"),
        "order_id": item.get("order_id") or item.get("source_order_id"),
        "source_catalog_row": item.get("source_catalog_row") or item.get("catalog_row"),
    }


def _build_payload(body: QuoteCreate, created_by: str | None) -> dict[str, Any]:
    lines: list[dict[str, Any]] = []
    if body.priced_items:
        for i, item in enumerate(body.priced_items, 1):
            lines.append(_line_from_priced(item, i))
    else:
        for i, line in enumerate(body.lines, 1):
            data = line.model_dump()
            data["id"] = _new_line_id()
            if data.get("line_no") is None:
                data["line_no"] = i
            lines.append(data)

    quote: dict[str, Any] = {
        "id": uuid.uuid4().hex,
        "status": "draft",
        "title": body.title
        or (f"Quote from {body.source_filename}" if body.source_filename else "New quotation"),
        "customer_name": body.customer_name,
        "currency": body.currency or "USD",
        "source_filename": body.source_filename,
        "match_mode": body.match_mode or "strict",
        "created_by": created_by,
        "created_at": _utc_now(),
        "updated_at": _utc_now(),
        "issued_at": None,
        "logistics": {**default_logistics(), **(body.logistics or {})},
        "extras": body.extras or default_extras(),
        "lines": lines,
        "snapshot": None,
        "liability_rule": LIABILITY_RULE,
    }
    return recalculate_quote(quote)


def _row_to_quote(row: sqlite3.Row) -> dict[str, Any]:
    payload = json.loads(row["payload"])
    payload["id"] = row["id"]
    payload["status"] = row["status"]
    payload["title"] = row["title"]
    payload["customer_name"] = row["customer_name"]
    payload["currency"] = row["currency"]
    payload["created_by"] = row["created_by"]
    payload["created_at"] = row["created_at"]
    payload["updated_at"] = row["updated_at"]
    payload["issued_at"] = row["issued_at"]
    return recalculate_quote(payload) if payload.get("status") != "issued" else payload


def _summary(quote: dict[str, Any]) -> dict[str, Any]:
    totals = quote.get("totals") or {}
    return {
        "id": quote["id"],
        "status": quote["status"],
        "title": quote.get("title"),
        "customer_name": quote.get("customer_name"),
        "currency": quote.get("currency") or "USD",
        "created_by": quote.get("created_by"),
        "created_at": quote.get("created_at"),
        "updated_at": quote.get("updated_at"),
        "issued_at": quote.get("issued_at"),
        "line_count": len(quote.get("lines") or []),
        "customer_total": totals.get("customer_total"),
        "declared_value": totals.get("declared_value"),
    }


def _save(quote: dict[str, Any]) -> dict[str, Any]:
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO quotes (
                id, status, title, customer_name, currency,
                created_by, created_at, updated_at, issued_at, payload
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                status=excluded.status,
                title=excluded.title,
                customer_name=excluded.customer_name,
                currency=excluded.currency,
                updated_at=excluded.updated_at,
                issued_at=excluded.issued_at,
                payload=excluded.payload
            """,
            (
                quote["id"],
                quote["status"],
                quote.get("title"),
                quote.get("customer_name"),
                quote.get("currency") or "USD",
                quote.get("created_by"),
                quote["created_at"],
                quote["updated_at"],
                quote.get("issued_at"),
                json.dumps(quote, ensure_ascii=False),
            ),
        )
        conn.commit()
    return quote


def create_quote(body: QuoteCreate, created_by: str | None) -> dict[str, Any]:
    init_db()
    quote = _build_payload(body, created_by)
    return _save(quote)


def list_quotes(limit: int = 50) -> list[dict[str, Any]]:
    init_db()
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM quotes ORDER BY updated_at DESC LIMIT ?",
            (max(1, min(limit, 200)),),
        ).fetchall()
    return [_summary(_row_to_quote(r)) for r in rows]


def get_quote(quote_id: str) -> dict[str, Any] | None:
    init_db()
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM quotes WHERE id = ?", (quote_id,)
        ).fetchone()
    if not row:
        return None
    return _row_to_quote(row)


def update_quote(quote_id: str, patch: QuotePatch) -> dict[str, Any]:
    quote = get_quote(quote_id)
    if not quote:
        raise KeyError("Quote not found")
    if quote.get("status") == "issued":
        raise PermissionError("Issued quotes are locked; create a new draft to change amounts.")

    if patch.title is not None:
        quote["title"] = patch.title
    if patch.customer_name is not None:
        quote["customer_name"] = patch.customer_name
    if patch.status is not None:
        if patch.status not in ("draft", "reviewed"):
            raise ValueError("status must be draft or reviewed (use /issue to issue)")
        quote["status"] = patch.status
    if patch.logistics is not None:
        quote["logistics"] = {**(quote.get("logistics") or {}), **patch.logistics}
    if patch.extras is not None:
        quote["extras"] = patch.extras
    if patch.lines is not None:
        quote["lines"] = patch.lines

    quote["updated_at"] = _utc_now()
    quote = recalculate_quote(quote)
    return _save(quote)


def issue_quote(quote_id: str) -> dict[str, Any]:
    quote = get_quote(quote_id)
    if not quote:
        raise KeyError("Quote not found")
    if quote.get("status") == "issued":
        return quote

    errors = validate_for_issue(quote)
    if errors:
        raise ValueError("; ".join(errors))

    quote = recalculate_quote(quote)
    breakdown = build_breakdown(quote)
    quote["status"] = "issued"
    quote["issued_at"] = _utc_now()
    quote["updated_at"] = quote["issued_at"]
    quote["snapshot"] = {
        "issued_at": quote["issued_at"],
        "liability_rule": LIABILITY_RULE,
        "breakdown": breakdown,
        "logistics": breakdown["logistics"],
        "lines": breakdown["lines"],
        "extras": breakdown["extras"],
        "totals": breakdown["totals"],
    }
    # Persist frozen payload without live recalculation mutating issued data
    with _connect() as conn:
        conn.execute(
            """
            UPDATE quotes SET
                status = ?, updated_at = ?, issued_at = ?, payload = ?
            WHERE id = ?
            """,
            (
                quote["status"],
                quote["updated_at"],
                quote["issued_at"],
                json.dumps(quote, ensure_ascii=False),
                quote_id,
            ),
        )
        conn.commit()
    return quote


def quote_breakdown(quote_id: str) -> dict[str, Any]:
    quote = get_quote(quote_id)
    if not quote:
        raise KeyError("Quote not found")
    if quote.get("status") == "issued" and quote.get("snapshot"):
        snap = quote["snapshot"]
        return {
            "quote_id": quote["id"],
            "status": quote["status"],
            "title": quote.get("title"),
            "customer_name": quote.get("customer_name"),
            "currency": quote.get("currency") or "USD",
            "issued_at": quote.get("issued_at"),
            "liability_rule": snap.get("liability_rule") or LIABILITY_RULE,
            "logistics": snap.get("logistics"),
            "lines": snap.get("lines"),
            "extras": snap.get("extras"),
            "charges": snap.get("breakdown", {}).get("charges")
            or build_breakdown(quote)["charges"],
            "totals": snap.get("totals"),
            "frozen": True,
        }
    out = build_breakdown(quote)
    out["frozen"] = False
    return out
