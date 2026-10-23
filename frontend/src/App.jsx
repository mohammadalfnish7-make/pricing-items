import { Fragment, useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "";

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg || d).join(", ")
          : res.status === 401
            ? "Not authenticated"
            : "Request failed";
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

function BrandMark() {
  return (
    <a className="brand-mark" href="https://karam-alarab.com" target="_blank" rel="noreferrer">
      <img src="/karam-logo.svg" alt="KARAM AL ARAB" />
    </a>
  );
}

function LoginScreen({ onLoggedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      onLoggedIn(data.email);
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app login-app">
      <section className="panel login-panel">
        <BrandMark />
        <h1 className="brand">Pricing</h1>
        <form className="login-form" onSubmit={onSubmit}>
          <input
            type="email"
            name="email"
            autoComplete="username"
            placeholder=" "
            aria-label="Username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder=" "
            aria-label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
          {error ? <p className="status error">{error}</p> : null}
        </form>
      </section>
    </div>
  );
}

function money(value, currency = "USD") {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function downloadRefsCsv(result, pageKey) {
  if (!result?.items?.length) return;
  const headers = [
    "match_mode",
    "request_line_no",
    "request_product",
    "match_status",
    "match_score",
    "usd_per_kg_itogo_div_gross",
    "gross_weight_kg",
    "source_catalog_file",
    "source_catalog_row",
    "source_order_id",
    "source_order_line",
    "matched_product",
    "countries",
    "country_diff",
    "country_note",
    "source_ref",
  ];
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    return `"${s.replaceAll('"', '""')}"`;
  };
  const lines = [headers.join(",")];
  for (const item of result.items) {
    lines.push(
      [
        pageKey || item.match_mode || "",
        item.line_no,
        item.product_name,
        item.match_status || item.cost_source || "",
        item.match_score,
        item.price_per_kg,
        item.gross_weight_kg,
        item.source_catalog_file,
        item.source_catalog_row,
        item.source_order_id || item.order_id,
        item.source_order_line,
        item.matched_product,
        (item.countries || []).join(" | "),
        item.country_diff ? "YES" : "",
        item.country_note,
        item.source_ref,
      ]
        .map(escape)
        .join(",")
    );
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(result.filename || "pricing").replace(/\.[^.]+$/, "")}_${pageKey || "refs"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function CatalogSearch({ onSessionLost }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("fuzzy");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setItems([]);
      setCount(0);
      setError("");
      setLoading(false);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ q, mode, limit: "25" });
        const data = await api(`/api/search?${params}`);
        setItems(data.items || []);
        setCount(data.count || 0);
      } catch (err) {
        if (err.status === 401) onSessionLost(null);
        setItems([]);
        setCount(0);
        setError(err.message || "Search failed");
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [query, mode, onSessionLost]);

  return (
    <section className="panel search-panel">
      <div className="search-head">
        <div>
          <h2>Search catalog</h2>
          <p>Type a product name — results update as you type.</p>
        </div>
        <div className="search-modes">
          <button
            type="button"
            className={`page-tab ${mode === "strict" ? "active" : ""}`}
            onClick={() => setMode("strict")}
          >
            Strict
          </button>
          <button
            type="button"
            className={`page-tab ${mode === "fuzzy" ? "active" : ""}`}
            onClick={() => setMode("fuzzy")}
          >
            Fuzzy
          </button>
        </div>
      </div>
      <input
        className="search-input"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type: накладка бампера, амортизатор…"
        autoComplete="off"
      />
      <p className={`status search-status ${error ? "error" : ""}`}>
        {error
          ? error
          : loading
            ? "Searching…"
            : query.trim()
              ? `${count} match${count === 1 ? "" : "es"}`
              : ""}
      </p>
      {items.length ? (
        <div className="table-wrap search-table">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>$/kg</th>
                <th title="How closely the name matches a catalog product. Higher is better.">
                  Match
                </th>
                <th>Country</th>
                <th>Order</th>
                <th>CSV row</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`${item.catalog_file}-${item.catalog_row}`}>
                  <td className="product">
                    <strong>{item.product_name}</strong>
                    <span>
                      {item.brand || item.manufacturer || "catalog"}
                      {item.source_ref ? ` · ${item.catalog_file}` : ""}
                    </span>
                  </td>
                  <td className="num">{item.usd_per_kg ?? "—"}</td>
                  <td className="num">{item.match_score ?? "—"}</td>
                  <td>{item.country || "—"}</td>
                  <td className="num">
                    {item.order_id || "—"}
                    {item.order_line ? ` / L${item.order_line}` : ""}
                  </td>
                  <td className="num">{item.catalog_row ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function ResultsPanel({ page, pageKey, openRef, setOpenRef }) {
  const items = page?.items ?? [];
  if (!page) return null;

  return (
    <>
      <section className="stats">
        <div className="stat">
          <span className="label">Items</span>
          <span className="value">{page.item_count}</span>
        </div>
        <div className="stat">
          <span className="label">Priced lines</span>
          <span className="value">{page.priced_count}</span>
        </div>
        <div className="stat">
          <span className="label">Catalog match</span>
          <span className="value">
            {page.catalog_matched ?? 0}/{page.item_count}
          </span>
        </div>
        <div className="stat">
          <span className="label">Total</span>
          <span className="value">
            {money(page.totals?.line_cost, page.currency)}
          </span>
        </div>
      </section>

      {(page.country_diff_count ?? 0) > 0 ? (
        <p className="status warn-banner">
          Country differences on {page.country_diff_count} line(s) — check the
          Country column.
        </p>
      ) : null}

      <p className="status" style={{ textAlign: "left", marginBottom: "1rem" }}>
        {pageKey === "fuzzy" ? (
          <>
            <strong>Page 2 — Fuzzy match</strong>
            {" · "}
            looser name matching (not specific). Review refs carefully.
          </>
        ) : (
          <>
            <strong>Page 1 — Strict match</strong>
            {" · "}
            closer name match only.
          </>
        )}
        {" · "}
        <code>$/kg = Итого ÷ gross kg</code>
        {" · "}
        Match = name closeness (1.00 is strong)
      </p>

      <div
        className="actions"
        style={{ justifyContent: "flex-start", margin: "0 0 1rem" }}
      >
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => downloadRefsCsv(page, pageKey)}
        >
          Download refs CSV
        </button>
      </div>

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Product</th>
              <th>$/kg</th>
              <th title="How closely the uploaded name matches a catalog product. Higher is better.">
                Match
              </th>
              <th>Country</th>
              <th>Source order</th>
              <th>CSV row</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <Fragment key={`${pageKey}-${item.line_no}-${idx}`}>
                <tr className={item.country_diff ? "row-warn" : undefined}>
                  <td className="num">{item.line_no || "—"}</td>
                  <td className="product">
                    <strong>{item.product_name || "—"}</strong>
                    <span>
                      {item.matched_product
                        ? `matched: ${item.matched_product}`
                        : item.match_status === "unmatched"
                          ? "no catalog match"
                          : "—"}
                    </span>
                  </td>
                  <td className="num">
                    {item.price_per_kg != null ? item.price_per_kg : "—"}
                  </td>
                  <td className="num">{item.match_score ?? "—"}</td>
                  <td>
                    {item.country_diff ? (
                      <span
                        className="chip chip-warn"
                        title={item.country_note || ""}
                      >
                        DIFF:{" "}
                        {(item.countries || []).join(" · ") || item.country_note}
                      </span>
                    ) : (
                      item.country_of_origin || item.source_country || "—"
                    )}
                  </td>
                  <td className="num">
                    {item.source_order_id || item.order_id || "—"}
                    {item.source_order_line
                      ? ` / L${item.source_order_line}`
                      : ""}
                  </td>
                  <td className="num">{item.source_catalog_row ?? "—"}</td>
                  <td className="ref-cell">
                    {item.source_ref ? (
                      <button
                        type="button"
                        className="ref-btn"
                        onClick={() =>
                          setOpenRef(openRef === idx ? null : idx)
                        }
                        title={item.source_ref}
                      >
                        {item.source_catalog_file || "catalog"}
                        {item.source_catalog_row
                          ? ` #${item.source_catalog_row}`
                          : ""}
                        {item.source_examples?.length > 1
                          ? ` (+${item.source_examples.length - 1})`
                          : ""}
                      </button>
                    ) : (
                      <span className="chip">unmatched</span>
                    )}
                  </td>
                </tr>
                {openRef === idx && item.source_examples?.length ? (
                  <tr className="ref-detail">
                    <td colSpan={8}>
                      {item.country_note ? (
                        <p className="country-note">{item.country_note}</p>
                      ) : null}
                      <ol className="ref-list">
                        {item.source_examples.map((ex, i) => (
                          <li key={`${ex.catalog_row}-${i}`}>
                            <code>
                              [{ex.country_of_origin || "—"}] {ex.source_ref}
                            </code>
                          </li>
                        ))}
                      </ol>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [pageKey, setPageKey] = useState("strict");
  const [openRef, setOpenRef] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api("/api/me")
      .then((data) => {
        if (!cancelled) setUser(data.email);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const previewName = useMemo(() => file?.name ?? "", [file]);

  const activePage = useMemo(() => {
    if (!result) return null;
    return result.pages?.[pageKey] || result;
  }, [result, pageKey]);

  async function priceFile(selected) {
    if (!selected) return;
    setLoading(true);
    setError("");
    setResult(null);
    setOpenRef(null);
    setPageKey("strict");
    try {
      const body = new FormData();
      body.append("file", selected);
      const data = await api("/api/price", { method: "POST", body });
      setResult(data);
    } catch (err) {
      if (err.status === 401) setUser(null);
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function onPick(next) {
    setFile(next);
    if (next) priceFile(next);
  }

  async function logout() {
    try {
      await api("/api/logout", { method: "POST" });
    } catch {
      /* still clear local session */
    }
    setUser(null);
    setFile(null);
    setResult(null);
    setError("");
  }

  const strictMatched = result?.pages?.strict?.catalog_matched;
  const fuzzyMatched = result?.pages?.fuzzy?.catalog_matched;

  if (!authReady) {
    return (
      <div className="app login-app">
        <p className="status">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLoggedIn={setUser} />;
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-top">
          <div>
            <BrandMark />
            <h1 className="brand">Pricing</h1>
          </div>
          <button type="button" className="btn btn-ghost" onClick={logout}>
            Sign out
          </button>
        </div>
        <p className="lede">
          Upload a CSV or Excel list. Actual $/kg = Итого ÷ gross kg
          (order file: E÷N · merged CSV: F÷Q). Two match pages: strict and
          fuzzy.
        </p>
      </header>

      <CatalogSearch onSessionLost={setUser} />

      <section className="panel">
        <div
          className={`dropzone ${dragOver ? "active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const next = e.dataTransfer.files?.[0];
            if (next) onPick(next);
          }}
        >
          <h2>Drop your items file</h2>
          <p>Accepts .csv, .xlsx, and .xls — order exports or name lists.</p>
          <div className="actions">
            <button type="button" className="btn btn-primary" disabled={loading}>
              {loading ? "Pricing…" : "Choose file"}
            </button>
            {previewName ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => priceFile(file)}
                disabled={loading || !file}
              >
                Re-run
              </button>
            ) : null}
          </div>
          {previewName ? <p className="status">Selected: {previewName}</p> : null}
          <input
            type="file"
            accept=".csv,.xlsx,.xlsm,.xls,application/vnd.ms-excel"
            onChange={(e) => onPick(e.target.files?.[0] || null)}
          />
        </div>
        <p className={`status ${error ? "error" : ""}`}>
          {error || (loading ? "Parsing and pricing items…" : "")}
        </p>
      </section>

      {result ? (
        <>
          <nav className="page-tabs" aria-label="Match pages">
            <button
              type="button"
              className={`page-tab ${pageKey === "strict" ? "active" : ""}`}
              onClick={() => {
                setPageKey("strict");
                setOpenRef(null);
              }}
            >
              Page 1 · Strict
              {strictMatched != null ? ` (${strictMatched})` : ""}
            </button>
            <button
              type="button"
              className={`page-tab ${pageKey === "fuzzy" ? "active" : ""}`}
              onClick={() => {
                setPageKey("fuzzy");
                setOpenRef(null);
              }}
            >
              Page 2 · Fuzzy
              {fuzzyMatched != null ? ` (${fuzzyMatched})` : ""}
            </button>
          </nav>

          <ResultsPanel
            page={activePage}
            pageKey={pageKey}
            openRef={openRef}
            setOpenRef={setOpenRef}
          />
        </>
      ) : null}
    </div>
  );
}
