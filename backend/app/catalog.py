"""Match name-only items against the historical orders catalog.

Actual $/kg = Итого ÷ gross weight.
- Order Excel (.xlsx): column E (Итого) ÷ column N (gross kg)
- Merged CSV: column F (total_amount) ÷ column Q (gross_weight_kg)
  (column E in the merged CSV is ITS — do not use it for $/kg)
"""

from __future__ import annotations

import csv
import os
import re
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from statistics import median
from typing import Any

DEFAULT_CATALOG_PATHS = (
    Path(os.environ.get("CATALOG_PATH", "")),
    Path("/data/all_orders_merged.csv"),
    Path(__file__).resolve().parents[2] / "data" / "all_orders_merged.csv",
)

STOP = {
    "И",
    "ДЛЯ",
    "С",
    "ИЗ",
    "НА",
    "В",
    "К",
    "НЕ",
    "ПО",
    "ОТ",
    "ДО",
    "БЕЗ",
    "НОВОЕ",
    "НОВЫЕ",
    "МЕТАЛ",
    "МЕТАЛЛ",
    "ПЛАСТИК",
}


def _fnum(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(str(value).replace(" ", "").replace(",", "."))
    except ValueError:
        return None


def _norm(text: str) -> str:
    text = text.upper().replace("Ё", "Е")
    text = re.sub(r"[^\w\sА-ЯA-Z0-9]", " ", text, flags=re.UNICODE)
    return re.sub(r"\s+", " ", text).strip()


def _tokens(text: str) -> list[str]:
    return [t for t in _norm(text).split() if t and t not in STOP and not t.isdigit()]


def _token_match(a: str, b: str) -> bool:
    if a == b:
        return True
    short, long = (a, b) if len(a) <= len(b) else (b, a)
    if len(short) < 5:
        return False
    if long.startswith(short) and len(short) / len(long) >= 0.72:
        return True
    if min(len(a), len(b)) >= 6:
        for n in (1, 2):
            if len(a) > n and len(b) > n and a[:-n] == b[:-n] and len(a) - n >= 5:
                return True
    return False


def _score(q_toks: list[str], c_toks: list[str], mode: str = "strict") -> float:
    if not q_toks or not c_toks:
        return 0.0
    matched = 0
    used: set[int] = set()
    for qt in q_toks:
        for i, ct in enumerate(c_toks):
            if i in used:
                continue
            if _token_match(qt, ct):
                matched += 1
                used.add(i)
                break
            # fuzzy: also allow shorter shared stems / containment
            if mode == "fuzzy" and min(len(qt), len(ct)) >= 4:
                short, long = (qt, ct) if len(qt) <= len(ct) else (ct, qt)
                if long.startswith(short) or short in long:
                    matched += 1
                    used.add(i)
                    break

    cover = matched / len(q_toks) if q_toks else 0.0

    if mode == "fuzzy":
        # Loose: any meaningful overlap is enough; prefer higher cover
        if matched == 0:
            return 0.0
        # soft boost when query is mostly covered
        return cover

    # strict rules (original)
    if not any(_token_match(q_toks[0], ct) for ct in c_toks[:2]):
        return 0.0
    if cover < 1.0 and len(c_toks) > len(q_toks) + 3:
        return 0.0
    if len(q_toks) == 1 and len(c_toks) > 3:
        return 0.0
    return cover


def _resolve_catalog_path() -> Path | None:
    for path in DEFAULT_CATALOG_PATHS:
        if path and path.is_file():
            return path
    return None


def _format_ref(entry: dict[str, Any]) -> str:
    parts = [
        f"file={entry['catalog_file']}",
        f"csv_row={entry['catalog_row']}",
    ]
    if entry.get("order_id"):
        parts.append(f"order={entry['order_id']}")
    if entry.get("source_line_no"):
        parts.append(f"order_line={entry['source_line_no']}")
    parts.append(f'product="{entry["name"]}"')
    if entry.get("country"):
        parts.append(f"country={entry['country']}")
    if entry.get("manufacturer"):
        parts.append(f'mfr="{entry["manufacturer"]}"')
    parts.append(f"itogo_F={entry['itogo']}")
    parts.append(f"gross_kg={entry['gross']}")
    parts.append(
        f"usd_per_kg={entry['usd_per_kg']} (= {entry['itogo']}/{entry['gross']})"
    )
    if entry.get("qty") is not None:
        parts.append(f"qty={entry['qty']}")
    parts.append(f"kg_per_unit_gross={round(entry['kg_per_unit'], 6)}")
    parts.append(f"cost_per_unit_usd={round(entry['cost_per_unit'], 4)}")
    return " | ".join(parts)


@lru_cache(maxsize=1)
def load_catalog() -> tuple[dict[str, Any], ...]:
    path = _resolve_catalog_path()
    if path is None:
        return ()

    catalog_file = path.name
    entries: list[dict[str, Any]] = []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for data_idx, row in enumerate(reader, start=2):
            name = (row.get("product_name") or "").strip()
            itogo = _fnum(row.get("total_amount"))  # merged CSV col F / order xlsx col E
            gross = _fnum(row.get("gross_weight_kg"))  # merged CSV col Q / order xlsx col N
            qty = _fnum(row.get("quantity_units"))
            if not name or itogo is None or gross in (None, 0) or qty in (None, 0):
                continue
            usd_per_kg = round(itogo / gross, 6)
            kg_per_unit = gross / qty
            entry = {
                "name": name,
                "toks": _tokens(name),
                "itogo": itogo,
                "gross": gross,
                "usd_per_kg": usd_per_kg,
                "qty": qty,
                "kg_per_unit": kg_per_unit,
                "cost_per_unit": itogo / qty,
                "order_id": row.get("order_id") or "",
                "source_line_no": (row.get("line_no") or "").strip(),
                "brand": row.get("brand") or "",
                "manufacturer": row.get("manufacturer") or "",
                "country": row.get("country_of_origin") or "",
                "its_raw": row.get("its_rate") or "",
                "catalog_file": catalog_file,
                "catalog_row": data_idx,
            }
            entry["source_ref"] = _format_ref(entry)
            entries.append(entry)
    return tuple(entries)


def match_catalog(product_name: str, mode: str = "strict") -> dict[str, Any] | None:
    """mode: 'strict' (exact-ish) or 'fuzzy' (loose / not specific)."""
    catalog = load_catalog()
    if not catalog or not product_name:
        return None

    mode = "fuzzy" if mode == "fuzzy" else "strict"
    q_toks = _tokens(product_name)
    if not q_toks:
        return None

    index: dict[str, list[int]] = defaultdict(list)
    for i, entry in enumerate(catalog):
        for token in entry["toks"][:6]:
            index[token[:5]].append(i)
            if len(token) >= 4:
                index[token[:4]].append(i)

    cand: set[int] = set()
    tokens_for_index = q_toks if mode == "fuzzy" else q_toks[:2]
    for token in tokens_for_index:
        cand.update(index.get(token[:5], []))
        if mode == "fuzzy" and len(token) >= 4:
            cand.update(index.get(token[:4], []))
    if not cand:
        cand = set(range(len(catalog)))

    best: list[tuple[float, int, dict[str, Any]]] = []
    if mode == "fuzzy":
        # at least one token overlap (~0.25+); single-token queries OK
        need = 0.25 if len(q_toks) >= 3 else (0.5 if len(q_toks) == 2 else 1.0)
        min_matched = 1
    else:
        need = 1.0 if len(q_toks) <= 2 else 0.67
        min_matched = min(len(q_toks), 2 if len(q_toks) >= 2 else 1)

    for i in cand:
        entry = catalog[i]
        cover = _score(q_toks, entry["toks"], mode=mode)
        matched = int(round(cover * len(q_toks))) if q_toks else 0
        if cover >= need and matched >= min_matched:
            best.append((cover, -abs(len(entry["toks"]) - len(q_toks)), entry))

    if not best:
        return None

    best.sort(key=lambda x: (x[0], x[1], x[2]["name"]), reverse=True)
    top = best[0][0]
    # fuzzy: keep a wider band of near-best scores so country diffs show
    band = 0.15 if mode == "fuzzy" else 0.001
    group = [entry for cover, _, entry in best if cover >= top - band][:8]
    primary = group[0]
    # Use the primary source row so $/kg matches the reference you open
    usd_med = float(primary["usd_per_kg"])
    kpu_med = float(primary["kg_per_unit"])
    cost_unit = round(primary["cost_per_unit"], 4)

    source_examples = [
        {
            "catalog_file": e["catalog_file"],
            "catalog_row": e["catalog_row"],
            "order_id": e["order_id"],
            "order_line": e["source_line_no"],
            "product_name": e["name"],
            "itogo": e["itogo"],
            "gross_weight_kg": e["gross"],
            "usd_per_kg": e["usd_per_kg"],
            "quantity_units": e["qty"],
            "kg_per_unit": round(e["kg_per_unit"], 6),
            "cost_per_unit_usd": round(e["cost_per_unit"], 4),
            "country_of_origin": e["country"] or None,
            "manufacturer": e["manufacturer"] or None,
            "brand": e["brand"] or None,
            "source_ref": e["source_ref"],
        }
        for e in group
    ]

    countries = sorted(
        {
            (e["country"] or "").strip()
            for e in group
            if (e.get("country") or "").strip()
        }
    )
    manufacturers = sorted(
        {
            (e["manufacturer"] or "").strip()
            for e in group
            if (e.get("manufacturer") or "").strip()
        }
    )
    country_diff = len(countries) > 1
    manufacturer_diff = len(manufacturers) > 1

    return {
        "matched_product": primary["name"],
        "match_score": round(top, 2),
        "match_examples": len(group),
        "usd_per_kg": round(usd_med, 6),
        "kg_per_unit": round(kpu_med, 6),
        "cost_per_unit": cost_unit,
        "assumed_qty": 1.0,
        "assumed_gross_kg": round(kpu_med, 6),
        "line_cost": cost_unit,
        "brand": primary["brand"],
        "manufacturer": primary["manufacturer"],
        "country": primary["country"],
        "its_raw": primary["its_raw"],
        "source_order_id": primary["order_id"],
        "source_order_line": primary["source_line_no"],
        "source_catalog_file": primary["catalog_file"],
        "source_catalog_row": primary["catalog_row"],
        "source_ref": primary["source_ref"],
        "source_examples": source_examples,
        "source_itogo": primary["itogo"],
        "source_gross": primary["gross"],
        "countries": countries,
        "country_diff": country_diff,
        "country_note": (
            f"DIFF countries: {' | '.join(countries)}" if country_diff else (countries[0] if countries else None)
        ),
        "manufacturers": manufacturers,
        "manufacturer_diff": manufacturer_diff,
        "manufacturer_note": (
            f"DIFF manufacturers: {' | '.join(manufacturers)}"
            if manufacturer_diff
            else (manufacturers[0] if manufacturers else None)
        ),
    }


def enrich_item_from_catalog(item: dict[str, Any], mode: str = "strict") -> dict[str, Any]:
    """Fill missing pricing from catalog using itogo/gross as $/kg."""
    if item.get("line_cost") is not None:
        item["match_mode"] = mode
        return item
    if not item.get("product_name"):
        return item

    hit = match_catalog(item["product_name"], mode=mode)
    if not hit:
        item["match_status"] = "unmatched"
        item["match_mode"] = mode
        item["source_ref"] = None
        item["source_examples"] = []
        return item

    qty = item.get("quantity_units")
    if qty in (None, 0):
        qty = hit["assumed_qty"]
        item["quantity_units"] = qty

    kg_per_unit = hit["kg_per_unit"]
    gross = item.get("gross_weight_kg")
    if gross is None:
        gross = round(kg_per_unit * float(qty), 6)
        item["gross_weight_kg"] = gross

    usd_per_kg = hit["usd_per_kg"]
    line_cost = round(usd_per_kg * float(gross), 2)
    unit_cost = round(line_cost / float(qty), 4) if qty else None

    request_country = (item.get("country_of_origin") or "").strip() or None
    countries = list(hit.get("countries") or [])
    country_diff = bool(hit.get("country_diff"))
    country_vs_request = None
    if request_country and countries:
        if request_country not in countries:
            country_vs_request = (
                f"DIFF vs request: request={request_country} · catalog={' | '.join(countries)}"
            )
            country_diff = True
        elif len(countries) > 1:
            country_vs_request = (
                f"DIFF in catalog matches: {' | '.join(countries)} (request={request_country})"
            )

    item.update(
        {
            "price_per_kg": usd_per_kg,
            "kg_per_unit": kg_per_unit,
            "unit_cost": unit_cost,
            "line_cost": line_cost,
            "itogo": line_cost,
            "declared_amount": line_cost,
            "cost_source": "catalog_itogo_per_gross_kg",
            "match_status": "matched",
            "match_mode": mode,
            "matched_product": hit["matched_product"],
            "match_score": hit["match_score"],
            "its_rate_raw": hit.get("its_raw") or None,
            "brand": item.get("brand") or hit["brand"] or None,
            "manufacturer": item.get("manufacturer") or hit["manufacturer"] or None,
            "country_of_origin": request_country or hit["country"] or None,
            "source_country": hit["country"] or None,
            "countries": countries,
            "country_diff": country_diff,
            "country_note": country_vs_request or hit.get("country_note"),
            "manufacturer_diff": bool(hit.get("manufacturer_diff")),
            "manufacturer_note": hit.get("manufacturer_note"),
            "order_id": item.get("order_id") or hit["source_order_id"] or None,
            "source_catalog_file": hit["source_catalog_file"],
            "source_catalog_row": hit["source_catalog_row"],
            "source_order_id": hit["source_order_id"],
            "source_order_line": hit["source_order_line"],
            "source_ref": hit["source_ref"],
            "source_examples": hit["source_examples"],
            "pricing_note": "usd_per_kg = itogo / gross_weight_kg",
        }
    )
    return item
