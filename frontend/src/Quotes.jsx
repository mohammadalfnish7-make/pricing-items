import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n.jsx";

function money(value, currency = "USD", locale = "en-US") {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function numOrEmpty(v) {
  if (v == null || v === "") return "";
  return String(v);
}

function parseNum(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function QuotesPanel({ api, onSessionLost, seedItems, seedFilename, seedMatchMode, onSeedConsumed }) {
  const { t, locale, translateError } = useI18n();
  const [list, setList] = useState([]);
  const [quote, setQuote] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("edit"); // edit | breakdown | list

  const locked = quote?.status === "issued";
  const quoteRef = useRef(quote);

  function setQuoteLocal(next) {
    const value = typeof next === "function" ? next(quoteRef.current) : next;
    quoteRef.current = value;
    setQuote(value);
  }

  const refreshList = useCallback(async () => {
    try {
      const data = await api("/api/quotes");
      setList(data.items || []);
    } catch (err) {
      if (err.status === 401) onSessionLost?.(null);
    }
  }, [api, onSessionLost]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  async function loadQuote(id) {
    setLoading(true);
    setError("");
    try {
      const q = await api(`/api/quotes/${id}`);
      setQuoteLocal(q);
      const bd = await api(`/api/quotes/${id}/breakdown`);
      setBreakdown(bd);
      setTab(q.status === "issued" ? "breakdown" : "edit");
    } catch (err) {
      if (err.status === 401) onSessionLost?.(null);
      setError(translateError(err.message) || t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  async function createFromSeed() {
    if (!seedItems?.length) return;
    setLoading(true);
    setError("");
    try {
      const data = await api("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: seedFilename ? `Quote · ${seedFilename}` : t("newQuote"),
          source_filename: seedFilename || null,
          match_mode: seedMatchMode || "strict",
          priced_items: seedItems,
        }),
      });
      setQuoteLocal(data);
      const bd = await api(`/api/quotes/${data.id}/breakdown`);
      setBreakdown(bd);
      setTab("edit");
      await refreshList();
      onSeedConsumed?.();
    } catch (err) {
      if (err.status === 401) onSessionLost?.(null);
      setError(translateError(err.message) || t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  async function persistQuote(patch = {}, { trackSaving = true } = {}) {
    const current = quoteRef.current;
    if (!current || current.status === "issued") return null;
    if (trackSaving) setSaving(true);
    setError("");
    // Always send the latest local worksheet so a blur on one field
    // cannot wipe unsaved edits on another.
    const body = {
      title: current.title,
      customer_name: current.customer_name,
      logistics: current.logistics,
      extras: current.extras,
      lines: current.lines,
      ...patch,
    };
    try {
      const data = await api(`/api/quotes/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setQuoteLocal(data);
      const bd = await api(`/api/quotes/${current.id}/breakdown`);
      setBreakdown(bd);
      await refreshList();
      return data;
    } catch (err) {
      if (err.status === 401) onSessionLost?.(null);
      setError(translateError(err.message) || t("genericError"));
      throw err;
    } finally {
      if (trackSaving) setSaving(false);
    }
  }

  async function savePatch(patch = {}) {
    return persistQuote(patch, { trackSaving: true });
  }

  async function issue() {
    if (!quoteRef.current || quoteRef.current.status === "issued") return;
    setSaving(true);
    setError("");
    try {
      await persistQuote({}, { trackSaving: false });
      const id = quoteRef.current.id;
      const data = await api(`/api/quotes/${id}/issue`, { method: "POST" });
      setQuoteLocal(data);
      const bd = await api(`/api/quotes/${id}/breakdown`);
      setBreakdown(bd);
      setTab("breakdown");
      await refreshList();
    } catch (err) {
      if (err.status === 401) onSessionLost?.(null);
      setError(translateError(err.message) || t("genericError"));
    } finally {
      setSaving(false);
    }
  }

  const logistics = quote?.logistics || {};
  const computed = quote?.logistics_computed || breakdown?.logistics || {};

  const totals = breakdown?.totals || quote?.totals || {};

  const statusLabel = useMemo(() => {
    if (!quote) return "";
    if (quote.status === "issued") return t("statusIssued");
    if (quote.status === "reviewed") return t("statusReviewed");
    return t("statusDraft");
  }, [quote, t]);

  return (
    <section className="panel quotes-panel">
      <div className="search-head">
        <div>
          <h2>{t("quotesTitle")}</h2>
          <p>{t("quotesHint")}</p>
        </div>
        <div className="search-modes">
          <button
            type="button"
            className={`page-tab ${tab === "list" ? "active" : ""}`}
            onClick={() => {
              setTab("list");
              refreshList();
            }}
          >
            {t("quotesList")}
          </button>
          {quote ? (
            <>
              <button
                type="button"
                className={`page-tab ${tab === "edit" ? "active" : ""}`}
                onClick={() => !locked && setTab("edit")}
                disabled={locked}
              >
                {t("quotesEdit")}
              </button>
              <button
                type="button"
                className={`page-tab ${tab === "breakdown" ? "active" : ""}`}
                onClick={() => setTab("breakdown")}
              >
                {t("quotesBreakdown")}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {seedItems?.length ? (
        <div className="quote-seed-banner">
          <p>
            {t("quoteSeedReady", { n: seedItems.length, name: seedFilename || t("catalog") })}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading}
            onClick={createFromSeed}
          >
            {t("createQuoteFromResults")}
          </button>
        </div>
      ) : null}

      <p className={`status search-status ${error ? "error" : ""}`}>
        {error || (loading ? t("loading") : saving ? t("saving") : "")}
      </p>

      {tab === "list" ? (
        <div className="table-wrap search-table">
          <table>
            <thead>
              <tr>
                <th>{t("quoteTitle")}</th>
                <th>{t("status")}</th>
                <th>{t("customer")}</th>
                <th>{t("total")}</th>
                <th>{t("updated")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={6}>{t("noQuotesYet")}</td>
                </tr>
              ) : (
                list.map((item) => (
                  <tr key={item.id}>
                    <td data-label={t("quoteTitle")}>
                      <strong>{item.title || item.id}</strong>
                      <span className="muted-block">{item.line_count} {t("items").toLowerCase()}</span>
                    </td>
                    <td data-label={t("status")}>
                      <span className={`chip chip-status-${item.status}`}>{item.status}</span>
                    </td>
                    <td data-label={t("customer")}>{item.customer_name || "—"}</td>
                    <td className="num" data-label={t("total")}>
                      {money(item.customer_total, item.currency, locale)}
                    </td>
                    <td data-label={t("updated")}>{item.updated_at || "—"}</td>
                    <td data-label={t("open")} className="quote-open-cell">
                      <button type="button" className="btn btn-ghost" onClick={() => loadQuote(item.id)}>
                        {t("open")}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {quote && tab === "edit" ? (
        <div className="quote-editor">
          <div className="quote-meta-row">
            <label>
              {t("quoteTitle")}
              <input
                value={quote.title || ""}
                disabled={locked}
                onChange={(e) => setQuoteLocal((q) => ({ ...q, title: e.target.value }))}
                onBlur={() => savePatch()}
              />
            </label>
            <label>
              {t("customer")}
              <input
                value={quote.customer_name || ""}
                disabled={locked}
                onChange={(e) => setQuoteLocal((q) => ({ ...q, customer_name: e.target.value }))}
                onBlur={() => savePatch()}
              />
            </label>
            <div className="quote-status-pill">
              <span className="label">{t("status")}</span>
              <strong>{statusLabel}</strong>
            </div>
          </div>

          <h3>{t("logisticsTitle")}</h3>
          <p className="hint">{t("logisticsHint")}</p>
          <div className="quote-grid">
            {[
              ["width_cm", t("widthCm")],
              ["length_cm", t("lengthCm")],
              ["height_cm", t("heightCm")],
              ["weight_kg", t("weightKg")],
              ["container_m3", t("containerM3")],
              ["freight_total", t("freightTotal")],
              ["customs", t("customsRussia")],
              ["chargeable_kg", t("chargeableKg")],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  step="any"
                  disabled={locked}
                  value={numOrEmpty(logistics[key])}
                  placeholder={key === "chargeable_kg" ? t("defaultGross") : ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? null : parseNum(e.target.value);
                    setQuoteLocal((q) => ({
                      ...q,
                      logistics: { ...(q.logistics || {}), [key]: val },
                    }));
                  }}
                  onBlur={() => savePatch()}
                />
              </label>
            ))}
            <label>
              {t("category")}
              <select
                disabled={locked}
                value={logistics.category || "spare_parts"}
                onChange={(e) => {
                  const category = e.target.value;
                  setQuoteLocal((q) => ({
                    ...q,
                    logistics: { ...(q.logistics || {}), category },
                  }));
                  savePatch();
                }}
              >
                <option value="spare_parts">{t("catSpareParts")}</option>
                <option value="perfume">{t("catPerfume")}</option>
                <option value="other">{t("catUnclassified")}</option>
              </select>
            </label>
            <label>
              {t("coefficientManual")}
              <input
                type="number"
                step="any"
                disabled={locked}
                value={numOrEmpty(logistics.coefficient)}
                placeholder={t("autoFromBand")}
                onChange={(e) => {
                  const coefficient = e.target.value === "" ? null : parseNum(e.target.value);
                  setQuoteLocal((q) => ({
                    ...q,
                    logistics: { ...(q.logistics || {}), coefficient },
                  }));
                }}
                onBlur={() => savePatch()}
              />
            </label>
          </div>

          <div className="quote-computed">
            <div>
              <span className="label">CBM</span>
              <strong>{computed.cbm ?? "—"}</strong>
            </div>
            <div>
              <span className="label">{t("density")}</span>
              <strong>
                {computed.density_for_z ?? "—"}
                {computed.density_kg_per_cbm != null
                  ? ` (${computed.density_kg_per_cbm})`
                  : ""}
              </strong>
            </div>
            <div>
              <span className="label">Z $/kg</span>
              <strong>{computed.transport_z ?? "—"}</strong>
            </div>
            <div title={t("invertedZHint")}>
              <span className="label">{t("invertedZCheck")}</span>
              <strong>{computed.inverted_z_check ?? "—"}</strong>
            </div>
            <div>
              <span className="label">S $/kg</span>
              <strong>{computed.selling_s ?? "—"}</strong>
            </div>
            <div>
              <span className="label">{t("coeff")}</span>
              <strong>
                {computed.coefficient ?? "—"}
                {computed.coefficient_source ? ` · ${computed.coefficient_source}` : ""}
              </strong>
            </div>
          </div>

          <h3>{t("extrasTitle")}</h3>
          <div className="quote-extras">
            {(quote.extras || []).map((row, idx) => (
              <div className="extra-row" key={row.key || idx}>
                <label>
                  {row.label || row.key}
                  <input
                    type="number"
                    step="any"
                    disabled={locked}
                    value={numOrEmpty(row.amount)}
                    onChange={(e) => {
                      const amount = parseNum(e.target.value) ?? 0;
                      setQuoteLocal((q) => {
                        const extras = [...(q.extras || [])];
                        extras[idx] = { ...extras[idx], amount, overridden: true };
                        return { ...q, extras };
                      });
                    }}
                    onBlur={() => savePatch()}
                  />
                </label>
                <label className="grow">
                  {t("reason")}
                  <input
                    disabled={locked}
                    value={row.reason || ""}
                    onChange={(e) => {
                      const reason = e.target.value;
                      setQuoteLocal((q) => {
                        const extras = [...(q.extras || [])];
                        extras[idx] = { ...extras[idx], reason };
                        return { ...q, extras };
                      });
                    }}
                    onBlur={() => savePatch()}
                  />
                </label>
              </div>
            ))}
          </div>

          <h3>{t("linesTitle")}</h3>
          <p className="hint">{t("declaredHint")}</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("product")}</th>
                  <th>{t("qty")}</th>
                  <th>{t("grossKg")}</th>
                  <th>{t("perKg")}</th>
                  <th>{t("goodsCost")}</th>
                  <th>{t("declaredPieces")}</th>
                  <th>{t("declaredTotal")}</th>
                </tr>
              </thead>
              <tbody>
                {(quote.lines || []).map((line, lineIdx) => (
                  <tr key={line.id || lineIdx}>
                    <td className="num" data-label="#">
                      {line.line_no ?? lineIdx + 1}
                    </td>
                    <td className="product" data-label={t("product")}>
                      <strong>{line.product_name || "—"}</strong>
                      <span>{line.matched_product || line.source_ref || ""}</span>
                    </td>
                    <td className="num" data-label={t("qty")}>
                      {line.quantity_units ?? "—"}
                    </td>
                    <td data-label={t("grossKg")}>
                      <input
                        className="cell-input"
                        type="number"
                        step="any"
                        disabled={locked}
                        value={numOrEmpty(line.gross_weight_kg)}
                        onChange={(e) => {
                          const gross_weight_kg = parseNum(e.target.value);
                          setQuoteLocal((q) => {
                            const lines = [...(q.lines || [])];
                            lines[lineIdx] = { ...lines[lineIdx], gross_weight_kg };
                            return { ...q, lines };
                          });
                        }}
                        onBlur={() => savePatch()}
                      />
                    </td>
                    <td data-label={t("perKg")}>
                      <input
                        className="cell-input"
                        type="number"
                        step="any"
                        disabled={locked}
                        value={numOrEmpty(line.usd_per_kg)}
                        onChange={(e) => {
                          const usd_per_kg = parseNum(e.target.value);
                          setQuoteLocal((q) => {
                            const lines = [...(q.lines || [])];
                            lines[lineIdx] = { ...lines[lineIdx], usd_per_kg };
                            return { ...q, lines };
                          });
                        }}
                        onBlur={() => savePatch()}
                      />
                    </td>
                    <td data-label={t("goodsCost")}>
                      <input
                        className="cell-input"
                        type="number"
                        step="any"
                        disabled={locked}
                        placeholder={t("autoComputed")}
                        value={numOrEmpty(line.goods_cost_override)}
                        onChange={(e) => {
                          const goods_cost_override =
                            e.target.value === "" ? null : parseNum(e.target.value);
                          setQuoteLocal((q) => {
                            const lines = [...(q.lines || [])];
                            lines[lineIdx] = { ...lines[lineIdx], goods_cost_override };
                            return { ...q, lines };
                          });
                        }}
                        onBlur={() => savePatch()}
                      />
                      <span className="muted-block">
                        {money(line.goods_cost, quote.currency, locale)}
                      </span>
                    </td>
                    <td className="pieces-cell" data-label={t("declaredPieces")}>
                      {(line.pieces || []).map((piece, pIdx) => (
                        <label key={piece.index || pIdx} className="piece-input">
                          <span>{piece.label || `#${piece.index}`}</span>
                          <input
                            type="number"
                            step="any"
                            disabled={locked}
                            value={numOrEmpty(piece.declared_value)}
                            onChange={(e) => {
                              const declared_value =
                                e.target.value === "" ? null : parseNum(e.target.value);
                              setQuoteLocal((q) => {
                                const lines = [...(q.lines || [])];
                                const pieces = [...(lines[lineIdx].pieces || [])];
                                pieces[pIdx] = { ...pieces[pIdx], declared_value };
                                lines[lineIdx] = { ...lines[lineIdx], pieces };
                                return { ...q, lines };
                              });
                            }}
                            onBlur={() => savePatch()}
                          />
                        </label>
                      ))}
                    </td>
                    <td className="num" data-label={t("declaredTotal")}>
                      {money(line.declared_total, quote.currency, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="stats quote-stats">
            <div className="stat">
              <span className="label">{t("goodsCost")}</span>
              <span className="value">{money(totals.goods, quote.currency, locale)}</span>
            </div>
            <div className="stat">
              <span className="label">{t("logisticsAmount")}</span>
              <span className="value">{money(totals.logistics, quote.currency, locale)}</span>
            </div>
            <div className="stat">
              <span className="label">{t("extrasTitle")}</span>
              <span className="value">{money(totals.extras, quote.currency, locale)}</span>
            </div>
            <div className="stat">
              <span className="label">{t("customerTotal")}</span>
              <span className="value">{money(totals.customer_total, quote.currency, locale)}</span>
            </div>
          </section>

          <div className="actions result-actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={locked || saving}
              onClick={() => savePatch({ status: "reviewed" })}
            >
              {t("markReviewed")}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={locked || saving}
              onClick={issue}
            >
              {t("issueQuote")}
            </button>
          </div>
          <p className="hint">{t("issueHint")}</p>
        </div>
      ) : null}

      {quote && tab === "breakdown" && breakdown ? (
        <div className="quote-breakdown">
          <header className="breakdown-head">
            <div>
              <h3>{breakdown.title}</h3>
              <p>
                {breakdown.customer_name ? `${t("customer")}: ${breakdown.customer_name} · ` : ""}
                {t("status")}: {breakdown.status}
                {breakdown.issued_at ? ` · ${breakdown.issued_at}` : ""}
                {breakdown.frozen ? ` · ${t("frozenSnapshot")}` : ""}
              </p>
            </div>
            <div className="breakdown-total">
              <span className="label">{t("customerTotal")}</span>
              <strong>{money(breakdown.totals?.customer_total, breakdown.currency, locale)}</strong>
            </div>
          </header>

          <p className="liability-note">{breakdown.liability_rule || t("liabilityRule")}</p>

          <h4>{t("charges")}</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("charge")}</th>
                  <th>{t("amount")}</th>
                  <th>{t("formula")}</th>
                  <th>{t("reason")}</th>
                </tr>
              </thead>
              <tbody>
                {(breakdown.charges || []).map((c, i) => (
                  <tr key={`${c.section}-${i}`}>
                    <td data-label={t("charge")}>
                      {c.label || c.charge}
                      {c.overridden ? <span className="chip chip-warn"> {t("overridden")}</span> : null}
                    </td>
                    <td className="num" data-label={t("amount")}>
                      {money(c.amount, breakdown.currency, locale)}
                    </td>
                    <td data-label={t("formula")}>
                      <code>{c.formula}</code>
                    </td>
                    <td data-label={t("reason")}>{c.reason || c.why || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4>{t("declaredPieces")}</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("product")}</th>
                  <th>{t("declaredPieces")}</th>
                  <th>{t("declaredTotal")}</th>
                </tr>
              </thead>
              <tbody>
                {(breakdown.lines || []).map((line) => (
                  <tr key={line.id || line.line_no}>
                    <td className="product" data-label={t("product")}>
                      <strong>{line.product_name}</strong>
                    </td>
                    <td data-label={t("declaredPieces")}>
                      {(line.pieces || []).map((p) => (
                        <span key={p.index} className="piece-chip">
                          {p.label || `#${p.index}`}: {money(p.declared_value, breakdown.currency, locale)}
                        </span>
                      ))}
                    </td>
                    <td className="num" data-label={t("declaredTotal")}>
                      {money(line.declared_total, breakdown.currency, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {breakdown.logistics ? (
            <>
              <h4>{t("logisticsTitle")}</h4>
              <p className="hint">
                CBM {breakdown.logistics.cbm} · density {breakdown.logistics.density_for_z} ·
                Z={breakdown.logistics.transport_z} · S={breakdown.logistics.selling_s} ·{" "}
                {t("invertedZCheck")}={breakdown.logistics.inverted_z_check}
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
