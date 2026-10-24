# Pricing Items

Demo app: upload a CSV/XLSX list of order items and see **cost per line**.

## What it does

1. Accepts `.csv`, `.xlsx`, or `.xls` (English headers like `all_orders_merged.csv`, bilingual headers, or a simple name list).
2. Parses each row into an item.
3. Prices using the order-file rule:
   - **$/kg** — `Итого` ÷ `gross weight` (order Excel: **E÷N**; merged CSV: **F÷Q**, not E/ITS)
   - **line_cost** — `Итого`
   - **kg_per_unit** — `gross_weight ÷ quantity`
   - **unit_cost** — `Итого ÷ quantity`
4. Returns JSON + a simple UI table with order totals and catalog source refs.

## Quick start (Docker)

**Local (with host ports 3000 / 8000):**

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

- UI: http://localhost:3000  
- API docs: http://localhost:8000/docs  

**Coolify / production:** use `docker-compose.yml` only (no host port binds).  
Point the Coolify domain at the **frontend** service, **port 80**.  
Backend stays internal as `http://backend:8000` (nginx proxies `/api`).

Upload `data/all_orders_merged.csv` from the UI to try it.

## Local development

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 (Vite proxies `/api` → backend).

## API

`POST /api/price` — multipart form field `file`.

Quotations (cookie session required):

- `GET /api/quotes` — list drafts/issued quotes (SQLite at `QUOTES_DB_PATH`)
- `POST /api/quotes` — create from `priced_items` or `lines`
- `GET /api/quotes/{id}` / `PATCH /api/quotes/{id}` — load / edit (issued quotes are locked)
- `POST /api/quotes/{id}/issue` — validate declared values and freeze breakdown
- `GET /api/quotes/{id}/breakdown` — customer-facing charge lines

Logistics: CBM → density → `Z = density × container_m³ / freight` → `S = (Z + customs) × coefficient`.

Example:

```bash
curl -s -F "file=@data/all_orders_merged.csv" http://localhost:8000/api/price | head
```
