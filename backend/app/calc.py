"""Handwritten note formulas: CBM → density → transport Z → selling S.

Customs ($/kg) is Russian customs from the sheet (Итого ÷ gross kg),
not the customer selling price.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

DEFAULT_CONTAINER_M3 = 80.0
DEFAULT_FREIGHT_TOTAL = 17_000.0
DEFAULT_CUSTOMS = 0.7

LIABILITY_RULE = (
    "Liability is per declared piece. Compensation uses the affected piece's "
    "declared value, not shipment weight."
)

# Spare-parts bands from the note. Edge 0.70 → lower band (coeff 2).
SPARE_PARTS_BANDS: tuple[tuple[float, float, float], ...] = (
    (0.30, 0.70, 2.0),
    (0.70, 1.10, 2.7),
)

CATEGORIES = ("spare_parts", "perfume", "other")


def _f(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def cbm_m3(width_cm: float, length_cm: float, height_cm: float) -> float:
    """ω = W × L × H (cm) / 1_000_000."""
    return round(float(width_cm) * float(length_cm) * float(height_cm) / 1_000_000.0, 6)


def density_kg_per_cbm(weight_kg: float, cbm: float) -> float:
    """Weight / CBM."""
    if cbm in (None, 0):
        raise ValueError("CBM must be non-zero")
    return float(weight_kg) / float(cbm)


def transport_z(
    density: float,
    container_m3: float = DEFAULT_CONTAINER_M3,
    freight_total: float = DEFAULT_FREIGHT_TOTAL,
) -> float:
    """Z = density × container_m3 / freight_total ($/kg). Rounded like the note (2 dp)."""
    if freight_total in (None, 0):
        raise ValueError("freight_total must be non-zero")
    return round(float(density) * float(container_m3) / float(freight_total), 2)


def spare_parts_coefficient(customs: float) -> float | None:
    """Suggest coefficient from spare-parts customs bands (0.70 → 2)."""
    c = float(customs)
    if 0.30 <= c <= 0.70:
        return 2.0
    if 0.70 < c <= 1.10:
        return 2.7
    return None


def resolve_coefficient(
    customs: float | None,
    category: str | None = "spare_parts",
    coefficient: float | None = None,
) -> tuple[float | None, bool, str | None]:
    """Return (coeff, is_manual, note)."""
    if coefficient is not None:
        return float(coefficient), True, "manual override"
    cat = (category or "spare_parts").strip().lower()
    if cat == "spare_parts" and customs is not None:
        suggested = spare_parts_coefficient(customs)
        if suggested is not None:
            return suggested, False, "spare_parts band"
        return None, False, "customs outside spare_parts bands; set coefficient manually"
    if cat in ("perfume", "other"):
        return None, False, f"{cat}: coefficient table not configured; set manually"
    return None, False, "unknown category"


def selling_s(z: float, customs: float, coefficient: float) -> float:
    """S = (Z + customs) × coefficient ($/kg). Rounded like the note (1 dp for 2.3)."""
    return round((float(z) + float(customs)) * float(coefficient), 2)


def default_logistics() -> dict[str, Any]:
    return {
        "width_cm": 100.0,
        "length_cm": 120.0,
        "height_cm": 260.0,
        "weight_kg": 300.0,
        "container_m3": DEFAULT_CONTAINER_M3,
        "freight_total": DEFAULT_FREIGHT_TOTAL,
        "customs": DEFAULT_CUSTOMS,
        "customs_source": "manual",  # manual | catalog | upload
        "customs_label": "Russian customs $/kg (Итого ÷ gross kg)",
        "category": "spare_parts",
        "coefficient": None,
        "chargeable_kg": None,
    }


def default_extras() -> list[dict[str, Any]]:
    return [
        {
            "id": "packaging",
            "name": "Packaging",
            "amount": 0.0,
            "reason": "Packaging and materials for the shipment.",
            "included": False,
        },
        {
            "id": "handling",
            "name": "Handling",
            "amount": 0.0,
            "reason": "Warehouse handling and loading.",
            "included": False,
        },
        {
            "id": "insurance",
            "name": "Insurance",
            "amount": 0.0,
            "reason": "Optional cargo insurance.",
            "included": False,
        },
        {
            "id": "service",
            "name": "Service fee",
            "amount": 0.0,
            "reason": "Service and documentation fee.",
            "included": False,
        },
    ]


def compute_logistics(logistics: dict[str, Any] | None) -> dict[str, Any]:
    """Compute CBM, density, Z, S and derived container fill figures."""
    lg = {**default_logistics(), **(logistics or {})}
    width = float(lg.get("width_cm") or 0)
    length = float(lg.get("length_cm") or 0)
    height = float(lg.get("height_cm") or 0)
    weight = float(lg.get("weight_kg") or 0)
    container = float(lg.get("container_m3") or DEFAULT_CONTAINER_M3)
    freight = float(lg.get("freight_total") or DEFAULT_FREIGHT_TOTAL)
    customs = float(lg.get("customs") if lg.get("customs") is not None else DEFAULT_CUSTOMS)
    category = (lg.get("category") or "spare_parts").strip().lower()
    manual_coeff = _f(lg.get("coefficient"))

    cbm = cbm_m3(width, length, height) if width and length and height else 0.0
    density = density_kg_per_cbm(weight, cbm) if cbm else 0.0
    # Note worked example uses rounded density (96) for Z → 0.45
    density_for_z = round(density, 0) if density else 0.0
    z_exact = transport_z(density, container, freight) if density and freight else 0.0
    z_note = (
        transport_z(density_for_z, container, freight) if density_for_z and freight else 0.0
    )
    z_display = round(z_note, 2)

    coeff, coeff_manual, coeff_note = resolve_coefficient(customs, category, manual_coeff)
    s = selling_s(z_display, customs, coeff) if coeff is not None else None

    pallets_in_container = round(container / cbm, 4) if cbm else None
    est_container_weight = (
        round(pallets_in_container * weight, 2) if pallets_in_container is not None else None
    )
    chargeable = _f(lg.get("chargeable_kg"))
    if chargeable is None:
        chargeable = weight
    logistics_amount = round(s * chargeable, 2) if s is not None and chargeable else None
    inverted_z = (
        round(freight / (density * container), 4)
        if density and container
        else None
    )

    return {
        **lg,
        "category": category,
        "cbm": cbm,
        "density": round(density, 6) if density else 0.0,
        "density_rounded": density_for_z,
        "transport_z": z_display,
        "transport_z_exact": round(z_exact, 6),
        "inverted_z_check": inverted_z,
        "customs": customs,
        "customs_label": "Russian customs $/kg (Итого ÷ gross kg)",
        "coefficient": coeff,
        "coefficient_manual": coeff_manual,
        "coefficient_note": coeff_note,
        "selling_s": s,
        "pallets_in_container": pallets_in_container,
        "est_container_weight_kg": est_container_weight,
        "chargeable_kg_used": chargeable,
        "logistics_amount": logistics_amount,
        "steps": [
            {
                "id": "cbm",
                "label": "CBM (ω)",
                "formula": f"{width} × {length} × {height} / 1,000,000",
                "value": cbm,
                "unit": "m³",
                "why": "Pallet volume in cubic metres.",
            },
            {
                "id": "density",
                "label": "Density",
                "formula": f"{weight} / {cbm}",
                "value": round(density, 4) if density else None,
                "unit": "kg/CBM",
                "why": "Weight per cubic metre for transport allocation.",
            },
            {
                "id": "transport_z",
                "label": "Transport Z",
                "formula": f"{density_for_z} × {container} / {freight}",
                "value": z_display,
                "unit": "$/kg",
                "why": "Share of total freight ($17,000 for full container) per kg.",
            },
            {
                "id": "customs",
                "label": "Customs (Russia)",
                "formula": "Итого ÷ gross kg (from catalog/order sheet)",
                "value": customs,
                "unit": "$/kg",
                "why": "Russian customs rate from the sheet, not the selling price.",
            },
            {
                "id": "selling_s",
                "label": "Selling S",
                "formula": f"({z_display} + {customs}) × {coeff}",
                "value": s,
                "unit": "$/kg",
                "why": "(Transport + customs) × category coefficient.",
            },
        ],
    }


class CalcRequest(BaseModel):
    width_cm: float = 100
    length_cm: float = 120
    height_cm: float = 260
    weight_kg: float = 300
    container_m3: float = DEFAULT_CONTAINER_M3
    freight_total: float = DEFAULT_FREIGHT_TOTAL
    customs: float = DEFAULT_CUSTOMS
    customs_source: str | None = "manual"
    category: str = "spare_parts"
    coefficient: float | None = None
    chargeable_kg: float | None = None


def run_quote_calc(payload: dict[str, Any] | CalcRequest | None = None) -> dict[str, Any]:
    """API helper: run note formulas and return intermediates + explanations."""
    if isinstance(payload, CalcRequest):
        data = payload.model_dump()
    elif payload is None:
        data = default_logistics()
    else:
        data = dict(payload)
    computed = compute_logistics(data)
    return {
        "inputs": {
            "width_cm": computed.get("width_cm"),
            "length_cm": computed.get("length_cm"),
            "height_cm": computed.get("height_cm"),
            "weight_kg": computed.get("weight_kg"),
            "container_m3": computed.get("container_m3"),
            "freight_total": computed.get("freight_total"),
            "customs": computed.get("customs"),
            "customs_source": computed.get("customs_source"),
            "category": computed.get("category"),
            "coefficient": data.get("coefficient"),
            "chargeable_kg": data.get("chargeable_kg"),
        },
        "cbm": computed["cbm"],
        "density": computed["density"],
        "density_rounded": computed["density_rounded"],
        "transport_z": computed["transport_z"],
        "transport_z_exact": computed["transport_z_exact"],
        "inverted_z_check": computed["inverted_z_check"],
        "customs": computed["customs"],
        "customs_label": computed["customs_label"],
        "coefficient": computed["coefficient"],
        "coefficient_manual": computed["coefficient_manual"],
        "coefficient_note": computed["coefficient_note"],
        "selling_s": computed["selling_s"],
        "pallets_in_container": computed["pallets_in_container"],
        "est_container_weight_kg": computed["est_container_weight_kg"],
        "chargeable_kg_used": computed["chargeable_kg_used"],
        "logistics_amount": computed["logistics_amount"],
        "quote_total": computed["logistics_amount"],
        "categories": list(CATEGORIES),
        "spare_parts_bands": [
            {"min": lo, "max": hi, "coefficient": coeff}
            for lo, hi, coeff in SPARE_PARTS_BANDS
        ],
        "steps": computed["steps"],
    }


def _ensure_pieces(line: dict[str, Any]) -> list[dict[str, Any]]:
    qty = int(round(float(line.get("quantity_units") or 0)))
    if qty < 1:
        qty = 1
    pieces = list(line.get("pieces") or [])
    by_index = {int(p.get("index") or 0): p for p in pieces if p.get("index") is not None}
    out: list[dict[str, Any]] = []
    for i in range(1, qty + 1):
        existing = by_index.get(i) or {}
        out.append(
            {
                "index": i,
                "label": existing.get("label") or f"Piece {i}",
                "declared_value": _f(existing.get("declared_value")),
            }
        )
    return out


def _line_goods_cost(line: dict[str, Any]) -> tuple[float | None, bool]:
    override = _f(line.get("goods_cost_override"))
    if override is not None:
        return round(override, 2), True
    usd = _f(line.get("usd_per_kg"))
    kg = _f(line.get("gross_weight_kg"))
    if usd is not None and kg is not None:
        return round(usd * kg, 2), False
    return None, False


def recalculate_quote(quote: dict[str, Any]) -> dict[str, Any]:
    """Attach logistics_computed, per-line goods/declared, and totals."""
    src_logistics = dict(quote.get("logistics") or {})
    logistics = compute_logistics(src_logistics)
    # Persist only editable logistics fields (+ source metadata)
    quote["logistics"] = {
        **{k: src_logistics.get(k, default_logistics()[k]) for k in default_logistics()},
        "customs_source": src_logistics.get("customs_source") or "manual",
    }
    quote["logistics_computed"] = logistics

    lines_out: list[dict[str, Any]] = []
    goods_total = 0.0
    declared_total = 0.0
    for line in quote.get("lines") or []:
        pieces = _ensure_pieces(line)
        line_declared = round(
            sum(
                p["declared_value"] or 0
                for p in pieces
                if p.get("declared_value") is not None
            ),
            2,
        )
        goods, overridden = _line_goods_cost(line)
        if goods is not None:
            goods_total += goods
        declared_total += line_declared
        lines_out.append(
            {
                **line,
                "pieces": pieces,
                "goods_cost": goods,
                "goods_cost_overridden": overridden,
                "declared_total": line_declared,
            }
        )
    quote["lines"] = lines_out

    extras = list(quote.get("extras") or default_extras())
    extras_total = round(
        sum(float(e.get("amount") or 0) for e in extras if float(e.get("amount") or 0) != 0),
        2,
    )
    quote["extras"] = extras

    logistics_amount = logistics.get("logistics_amount") or 0.0
    quote["totals"] = {
        "goods": round(goods_total, 2),
        "logistics": logistics_amount,
        "extras": extras_total,
        "declared_value": round(declared_total, 2),
        "customer_total": round(goods_total + logistics_amount + extras_total, 2),
    }
    return quote


def build_breakdown(quote: dict[str, Any]) -> dict[str, Any]:
    quote = recalculate_quote(dict(quote))
    logistics = quote["logistics_computed"]
    currency = quote.get("currency") or "USD"
    charges: list[dict[str, Any]] = []

    for line in quote.get("lines") or []:
        if line.get("goods_cost") is None:
            continue
        usd = line.get("usd_per_kg")
        kg = line.get("gross_weight_kg")
        if line.get("goods_cost_overridden"):
            formula = f"override = {line['goods_cost']}"
        else:
            formula = f"{usd} $/kg × {kg} kg"
        charges.append(
            {
                "id": f"goods-{line.get('id') or line.get('line_no')}",
                "charge": line.get("product_name") or "Goods",
                "amount": line["goods_cost"],
                "formula": formula,
                "why": "Catalog/order sheet cost (Итого ÷ gross as $/kg × weight).",
                "overridden": bool(line.get("goods_cost_overridden")),
            }
        )

    if logistics.get("logistics_amount") is not None:
        charges.append(
            {
                "id": "logistics",
                "charge": "Transport & customs (S × kg)",
                "amount": logistics["logistics_amount"],
                "formula": (
                    f"S={logistics.get('selling_s')} $/kg × "
                    f"{logistics.get('chargeable_kg_used')} kg "
                    f"(Z={logistics.get('transport_z')} + customs={logistics.get('customs')}) "
                    f"× coeff={logistics.get('coefficient')}"
                ),
                "why": "Handwritten note: (transport Z + Russian customs) × category coefficient.",
                "overridden": False,
            }
        )

    for extra in quote.get("extras") or []:
        amount = float(extra.get("amount") or 0)
        if amount == 0:
            continue
        charges.append(
            {
                "id": f"extra-{extra.get('id') or extra.get('name')}",
                "charge": extra.get("name") or "Extra",
                "amount": round(amount, 2),
                "formula": f"flat {amount}",
                "why": extra.get("reason") or "Additional charge.",
                "overridden": False,
            }
        )

    return {
        "quote_id": quote.get("id"),
        "status": quote.get("status"),
        "title": quote.get("title"),
        "customer_name": quote.get("customer_name"),
        "currency": currency,
        "issued_at": quote.get("issued_at"),
        "liability_rule": quote.get("liability_rule") or LIABILITY_RULE,
        "logistics": logistics,
        "lines": quote.get("lines") or [],
        "extras": [
            e for e in (quote.get("extras") or []) if float(e.get("amount") or 0) != 0
        ],
        "charges": charges,
        "totals": quote.get("totals") or {},
        "steps": logistics.get("steps") or [],
    }


def validate_for_issue(quote: dict[str, Any]) -> list[str]:
    """Require a declared_value > 0 on every piece before Issue."""
    errors: list[str] = []
    quote = recalculate_quote(dict(quote))
    logistics = quote.get("logistics_computed") or {}
    if logistics.get("selling_s") is None:
        errors.append("Set a valid category coefficient before issuing")
    for line in quote.get("lines") or []:
        name = line.get("product_name") or f"line {line.get('line_no')}"
        pieces = line.get("pieces") or _ensure_pieces(line)
        qty = int(round(float(line.get("quantity_units") or len(pieces) or 1)))
        for i in range(1, qty + 1):
            piece = next((p for p in pieces if int(p.get("index") or 0) == i), None)
            value = _f(piece.get("declared_value")) if piece else None
            if value is None or value <= 0:
                errors.append(f"{name}: piece {i} needs declared_value > 0")
    return errors
