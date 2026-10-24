"""Lock the spare-parts worked example from the handwritten note."""

from app.calc import (
    build_breakdown,
    cbm_m3,
    density_kg_per_cbm,
    selling_s,
    spare_parts_coefficient,
    transport_z,
    validate_for_issue,
)


def test_worked_pallet_cbm_density_z_s():
    cbm = cbm_m3(100, 120, 260)
    assert cbm == 3.12
    density = density_kg_per_cbm(300, cbm)
    assert round(density, 0) == 96
    # Use the note's rounded density for Z
    z = transport_z(96, 80, 17_000)
    assert z == 0.45
    assert spare_parts_coefficient(0.7) == 2.0
    assert selling_s(0.45, 0.7, 2.0) == 2.3


def test_five_piece_declared_values():
    quote = {
        "id": "t1",
        "status": "draft",
        "title": "Test",
        "logistics": {
            "width_cm": 100,
            "length_cm": 120,
            "height_cm": 260,
            "weight_kg": 300,
            "container_m3": 80,
            "freight_total": 17000,
            "customs": 0.7,
            "category": "spare_parts",
            "coefficient": None,
            "chargeable_kg": None,
        },
        "extras": [],
        "lines": [
            {
                "id": "l1",
                "line_no": 1,
                "product_name": "Niche sample",
                "quantity_units": 5,
                "gross_weight_kg": 1,
                "usd_per_kg": 10,
                "pieces": [
                    {"index": 1, "declared_value": 100},
                    {"index": 2, "declared_value": 200},
                    {"index": 3, "declared_value": 400},
                    {"index": 4, "declared_value": 500},
                    {"index": 5, "declared_value": 200},
                ],
            }
        ],
    }
    bd = build_breakdown(quote)
    assert bd["lines"][0]["declared_total"] == 1400
    assert bd["totals"]["declared_value"] == 1400
    assert bd["logistics"]["transport_z"] == 0.45
    assert bd["logistics"]["selling_s"] == 2.3
    assert validate_for_issue(quote) == []


def test_issue_requires_declared_values():
    quote = {
        "logistics": {
            "width_cm": 100,
            "length_cm": 120,
            "height_cm": 260,
            "weight_kg": 300,
            "container_m3": 80,
            "freight_total": 17000,
            "customs": 0.7,
            "category": "spare_parts",
        },
        "lines": [
            {
                "product_name": "Item",
                "quantity_units": 2,
                "gross_weight_kg": 1,
                "usd_per_kg": 1,
                "pieces": [{"index": 1, "declared_value": 10}],
            }
        ],
    }
    errors = validate_for_issue(quote)
    assert any("piece 2" in e for e in errors)
