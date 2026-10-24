import { Fragment, useEffect, useMemo, useState } from "react";
import { Calculator } from "./Calculator.jsx";
import { LangSwitch, useI18n } from "./i18n.jsx";
import { QuotesPanel } from "./Quotes.jsx";

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
  const { t, translateError } = useI18n();
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
      setError(translateError(err.message) || t("loginFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app login-app">
      <section className="panel login-panel">
        <div className="login-top">
          <BrandMark />
          <LangSwitch />
        </div>
        <h1 className="brand">{t("pricing")}</h1>
        <form className="login-form" onSubmit={onSubmit}>
          <input
            type="email"
            name="email"
            autoComplete="username"
            placeholder=" "
            aria-label={t("username")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder=" "
            aria-label={t("password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? t("signingIn") : t("signIn")}
          </button>
          {error ? <p className="status error">{error}</p> : null}
        </form>
      </section>
    </div>
  );
}

function money(value, currency = "USD", locale = "en-US") {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat(locale, {
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

function CatalogSearch({ onSessionLost, onUseInCalculator }) {
  const { t, translateError } = useI18n();
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
        setError(translateError(err.message) || t("searchFailed"));
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
          <h2>{t("searchTitle")}</h2>
          <p>{t("searchHint")}</p>
        </div>
        <div className="search-modes">
          <button
            type="button"
            className={`page-tab ${mode === "strict" ? "active" : ""}`}
            onClick={() => setMode("strict")}
          >
            {t("strict")}
          </button>
          <button
            type="button"
            className={`page-tab ${mode === "fuzzy" ? "active" : ""}`}
            onClick={() => setMode("fuzzy")}
          >
            {t("fuzzy")}
          </button>
        </div>
      </div>
      <input
        className="search-input"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchPlaceholder")}
        autoComplete="off"
      />
      <p className={`status search-status ${error ? "error" : ""}`}>
        {error
          ? error
          : loading
            ? t("searching")
            : query.trim()
              ? t(count === 1 ? "matchesOne" : "matchesMany", { n: count })
              : ""}
      </p>
      {items.length ? (
        <div className="table-wrap search-table">
          <table>
            <thead>
              <tr>
                <th>{t("product")}</th>
                <th>{t("perKg")}</th>
                <th title={t("matchTitle")}>{t("match")}</th>
                <th>{t("country")}</th>
                <th>{t("order")}</th>
                <th>{t("csvRow")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`${item.catalog_file}-${item.catalog_row}`}>
                  <td className="product" data-label={t("product")}>
                    <strong>{item.product_name}</strong>
                    <span>
                      {item.brand || item.manufacturer || t("catalog")}
                      {item.source_ref ? ` · ${item.catalog_file}` : ""}
                    </span>
                  </td>
                  <td className="num" data-label={t("perKg")}>{item.usd_per_kg ?? "—"}</td>
                  <td className="num" data-label={t("match")}>{item.match_score ?? "—"}</td>
                  <td data-label={t("country")}>{item.country || "—"}</td>
                  <td className="num" data-label={t("order")}>
                    {item.order_id || "—"}
                    {item.order_line ? ` / L${item.order_line}` : ""}
                  </td>
                  <td className="num" data-label={t("csvRow")}>{item.catalog_row ?? "—"}</td>
                  <td data-label={t("useInCalculator")} className="quote-open-cell">
                    {item.usd_per_kg != null && onUseInCalculator ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => onUseInCalculator(item.usd_per_kg)}
                        title={t("calcCustomsHint")}
                      >
                        {t("useInCalculator")}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function ResultsPanel({ page, pageKey, openRef, setOpenRef, onCreateQuote, onUseInCalculator }) {
  const { t, locale } = useI18n();
  const items = page?.items ?? [];
  if (!page) return null;

  return (
    <>
      <section className="stats">
        <div className="stat">
          <span className="label">{t("items")}</span>
          <span className="value">{page.item_count}</span>
        </div>
        <div className="stat">
          <span className="label">{t("pricedLines")}</span>
          <span className="value">{page.priced_count}</span>
        </div>
        <div className="stat">
          <span className="label">{t("catalogMatch")}</span>
          <span className="value">
            {page.catalog_matched ?? 0}/{page.item_count}
          </span>
        </div>
        <div className="stat">
          <span className="label">{t("total")}</span>
          <span className="value">
            {money(page.totals?.line_cost, page.currency, locale)}
          </span>
        </div>
      </section>

      {(page.country_diff_count ?? 0) > 0 ? (
        <p className="status warn-banner">
          {t("countryDiff", { n: page.country_diff_count })}
        </p>
      ) : null}

      <p className="status note-line">
        {pageKey === "fuzzy" ? (
          <>
            <strong>{t("pageFuzzy")}</strong>
            {" · "}
            {t("pageFuzzyHint")}
          </>
        ) : (
          <>
            <strong>{t("pageStrict")}</strong>
            {" · "}
            {t("pageStrictHint")}
          </>
        )}
        {" · "}
        <code>$/kg = Итого ÷ gross kg</code>
        {" · "}
        {t("calcCustomsHint")}
        {" · "}
        {t("matchNote")}
      </p>

      <div className="actions result-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => downloadRefsCsv(page, pageKey)}
        >
          {t("downloadRefs")}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            onCreateQuote?.({
              items: page.items,
              filename: page.filename,
              matchMode: pageKey,
            })
          }
        >
          {t("createQuoteFromResults")}
        </button>
      </div>

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>{t("product")}</th>
              <th>{t("perKg")}</th>
              <th title={t("matchTitle")}>{t("match")}</th>
              <th>{t("country")}</th>
              <th>{t("sourceOrder")}</th>
              <th>{t("csvRow")}</th>
              <th>{t("reference")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <Fragment key={`${pageKey}-${item.line_no}-${idx}`}>
                <tr className={item.country_diff ? "row-warn" : undefined}>
                  <td className="num" data-label="#">
                    {item.line_no || "—"}
                  </td>
                  <td className="product" data-label={t("product")}>
                    <strong>{item.product_name || "—"}</strong>
                    <span>
                      {item.matched_product
                        ? t("matched", { name: item.matched_product })
                        : item.match_status === "unmatched"
                          ? t("noCatalogMatch")
                          : "—"}
                    </span>
                  </td>
                  <td className="num" data-label={t("perKg")}>
                    {item.price_per_kg != null ? (
                      <button
                        type="button"
                        className="ref-btn"
                        title={t("useInCalculator")}
                        onClick={() => onUseInCalculator?.(item.price_per_kg)}
                      >
                        {item.price_per_kg}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="num" data-label={t("match")}>
                    {item.match_score ?? "—"}
                  </td>
                  <td data-label={t("country")}>
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
                  <td className="num" data-label={t("sourceOrder")}>
                    {item.source_order_id || item.order_id || "—"}
                    {item.source_order_line
                      ? ` / L${item.source_order_line}`
                      : ""}
                  </td>
                  <td className="num" data-label={t("csvRow")}>
                    {item.source_catalog_row ?? "—"}
                  </td>
                  <td className="ref-cell" data-label={t("reference")}>
                    {item.source_ref ? (
                      <button
                        type="button"
                        className="ref-btn"
                        onClick={() =>
                          setOpenRef(openRef === idx ? null : idx)
                        }
                        title={item.source_ref}
                      >
                        {item.source_catalog_file || t("catalog")}
                        {item.source_catalog_row
                          ? ` #${item.source_catalog_row}`
                          : ""}
                        {item.source_examples?.length > 1
                          ? ` (+${item.source_examples.length - 1})`
                          : ""}
                      </button>
                    ) : (
                      <span className="chip">{t("unmatched")}</span>
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
  const { t, translateError } = useI18n();
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [pageKey, setPageKey] = useState("strict");
  const [openRef, setOpenRef] = useState(null);
  const [quoteSeed, setQuoteSeed] = useState(null);
  const [mainView, setMainView] = useState("pricing"); // pricing | calculator | quotes
  const [seedCustoms, setSeedCustoms] = useState(null);

  function useCustomsInCalculator(usdPerKg) {
    if (usdPerKg == null || Number.isNaN(Number(usdPerKg))) return;
    setSeedCustoms(Number(usdPerKg));
    setMainView("calculator");
  }

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
      setQuoteSeed(null);
    } catch (err) {
      if (err.status === 401) setUser(null);
      setError(translateError(err.message) || t("genericError"));
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
        <p className="status">{t("loading")}</p>
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
            <h1 className="brand">{t("pricing")}</h1>
          </div>
          <div className="hero-actions">
            <LangSwitch />
            <button type="button" className="btn btn-ghost" onClick={logout}>
              {t("signOut")}
            </button>
          </div>
        </div>
        <p className="lede">{t("lede")}</p>
        <nav className="page-tabs main-nav" aria-label="Main">
          <button
            type="button"
            className={`page-tab ${mainView === "pricing" ? "active" : ""}`}
            onClick={() => setMainView("pricing")}
          >
            {t("navPricing")}
          </button>
          <button
            type="button"
            className={`page-tab ${mainView === "calculator" ? "active" : ""}`}
            onClick={() => setMainView("calculator")}
          >
            {t("navCalculator")}
          </button>
          <button
            type="button"
            className={`page-tab ${mainView === "quotes" ? "active" : ""}`}
            onClick={() => setMainView("quotes")}
          >
            {t("navQuotes")}
          </button>
        </nav>
      </header>

      {mainView === "calculator" ? (
        <Calculator
          api={api}
          onSessionLost={setUser}
          seedCustoms={seedCustoms}
          onSeedCustomsConsumed={() => setSeedCustoms(null)}
        />
      ) : null}

      {mainView === "quotes" ? (
        <div id="quotes-panel">
          <QuotesPanel
            api={api}
            onSessionLost={setUser}
            seedItems={quoteSeed?.items || null}
            seedFilename={quoteSeed?.filename || null}
            seedMatchMode={quoteSeed?.matchMode || pageKey}
            onSeedConsumed={() => setQuoteSeed(null)}
          />
        </div>
      ) : null}

      {mainView === "pricing" ? (
        <>
          <CatalogSearch
            onSessionLost={setUser}
            onUseInCalculator={useCustomsInCalculator}
          />

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
              <h2>{t("dropTitle")}</h2>
              <p>{t("dropHint")}</p>
              <div className="actions">
                <button type="button" className="btn btn-primary" disabled={loading}>
                  {loading ? t("pricingNow") : t("chooseFile")}
                </button>
                {previewName ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => priceFile(file)}
                    disabled={loading || !file}
                  >
                    {t("rerun")}
                  </button>
                ) : null}
              </div>
              {previewName ? (
                <p className="status">{t("selected", { name: previewName })}</p>
              ) : null}
              <input
                type="file"
                accept=".csv,.xlsx,.xlsm,.xls,application/vnd.ms-excel"
                onChange={(e) => onPick(e.target.files?.[0] || null)}
              />
            </div>
            <p className={`status ${error ? "error" : ""}`}>
              {error || (loading ? t("parsing") : "")}
            </p>
          </section>

          {result ? (
            <>
              <nav className="page-tabs" aria-label={t("matchPages")}>
                <button
                  type="button"
                  className={`page-tab ${pageKey === "strict" ? "active" : ""}`}
                  onClick={() => {
                    setPageKey("strict");
                    setOpenRef(null);
                  }}
                >
                  {t("page1Strict")}
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
                  {t("page2Fuzzy")}
                  {fuzzyMatched != null ? ` (${fuzzyMatched})` : ""}
                </button>
              </nav>

              <ResultsPanel
                page={activePage}
                pageKey={pageKey}
                openRef={openRef}
                setOpenRef={setOpenRef}
                onUseInCalculator={useCustomsInCalculator}
                onCreateQuote={(seed) => {
                  setQuoteSeed(seed);
                  setMainView("quotes");
                }}
              />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
