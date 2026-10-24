import { useEffect, useState } from "react";
import { useI18n } from "./i18n.jsx";

const WORKED = {
  width_cm: 100,
  length_cm: 120,
  height_cm: 260,
  weight_kg: 300,
  container_m3: 80,
  freight_total: 17000,
  customs: 0.7,
  customs_source: "manual",
  category: "spare_parts",
  coefficient: null,
  chargeable_kg: null,
};

function numOrEmpty(v) {
  if (v == null || v === "") return "";
  return String(v);
}

function parseNum(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function Calculator({ api, onSessionLost, seedCustoms, onSeedCustomsConsumed }) {
  const { t, translateError } = useI18n();
  const [inputs, setInputs] = useState(WORKED);
  const [coeffManual, setCoeffManual] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [catalogQ, setCatalogQ] = useState("");
  const [catalogHits, setCatalogHits] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  // Seed customs from Pricing page / catalog match
  useEffect(() => {
    if (seedCustoms == null || Number.isNaN(Number(seedCustoms))) return;
    setInputs((prev) => ({
      ...prev,
      customs: Number(seedCustoms),
      customs_source: "catalog",
    }));
    onSeedCustomsConsumed?.();
  }, [seedCustoms, onSeedCustomsConsumed]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      const body = {
        ...inputs,
        coefficient: coeffManual === "" ? null : parseNum(coeffManual),
        chargeable_kg:
          inputs.chargeable_kg === "" || inputs.chargeable_kg == null
            ? null
            : Number(inputs.chargeable_kg),
      };
      try {
        const data = await api("/api/calc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        setResult(data);
      } catch (err) {
        if (err.status === 401) onSessionLost?.(null);
        setResult(null);
        setError(translateError(err.message) || t("genericError"));
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [inputs, coeffManual, api, onSessionLost, t, translateError]);

  useEffect(() => {
    const q = catalogQ.trim();
    if (!q) {
      setCatalogHits([]);
      setCatalogLoading(false);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setCatalogLoading(true);
      try {
        const params = new URLSearchParams({ q, mode: "fuzzy", limit: "8" });
        const data = await api(`/api/search?${params}`);
        setCatalogHits(data.items || []);
      } catch (err) {
        if (err.status === 401) onSessionLost?.(null);
        setCatalogHits([]);
      } finally {
        setCatalogLoading(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [catalogQ, api, onSessionLost]);

  function setField(key, raw) {
    const val = raw === "" ? "" : parseNum(raw);
    setInputs((prev) => ({
      ...prev,
      [key]: val === null && raw !== "" ? prev[key] : val === null ? "" : val,
      ...(key === "customs" ? { customs_source: "manual" } : {}),
    }));
  }

  function useCatalogCustoms(hit) {
    if (hit?.usd_per_kg == null) return;
    setInputs((prev) => ({
      ...prev,
      customs: Number(hit.usd_per_kg),
      customs_source: "catalog",
    }));
    setCatalogQ(hit.product_name || "");
  }

  function resetWorked() {
    setInputs(WORKED);
    setCoeffManual("");
    setCatalogQ("");
    setCatalogHits([]);
  }

  const steps = result?.steps || [];
  const bands = result?.spare_parts_bands || [];

  return (
    <section className="panel calc-panel">
      <div className="search-head">
        <div>
          <h2>{t("calcTitle")}</h2>
          <p>{t("calcHint")}</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={resetWorked}>
          {t("calcResetExample")}
        </button>
      </div>

      <div className="calc-layout">
        <div className="calc-inputs">
          <h3>{t("calcPallet")}</h3>
          <div className="quote-grid">
            {[
              ["width_cm", t("widthCm")],
              ["length_cm", t("lengthCm")],
              ["height_cm", t("heightCm")],
              ["weight_kg", t("weightKg")],
              ["container_m3", t("containerM3")],
              ["freight_total", t("freightTotal")],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  step="any"
                  value={numOrEmpty(inputs[key])}
                  onChange={(e) => setField(key, e.target.value)}
                />
              </label>
            ))}
          </div>

          <h3>{t("calcCustomsBlock")}</h3>
          <p className="hint">{t("calcCustomsHint")}</p>
          <div className="quote-grid">
            <label>
              {t("customsRussia")}
              <input
                type="number"
                step="any"
                value={numOrEmpty(inputs.customs)}
                onChange={(e) => setField("customs", e.target.value)}
              />
              {inputs.customs_source === "catalog" ? (
                <span className="chip chip-ok">{t("customsFromCatalog")}</span>
              ) : null}
            </label>
            <label>
              {t("category")}
              <select
                value={inputs.category || "spare_parts"}
                onChange={(e) =>
                  setInputs((prev) => ({ ...prev, category: e.target.value }))
                }
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
                value={coeffManual}
                placeholder={
                  result?.coefficient != null
                    ? String(result.coefficient)
                    : t("autoFromBand")
                }
                onChange={(e) => setCoeffManual(e.target.value)}
              />
            </label>
            <label>
              {t("chargeableKg")}
              <input
                type="number"
                step="any"
                value={numOrEmpty(inputs.chargeable_kg)}
                placeholder={t("defaultGross")}
                onChange={(e) => setField("chargeable_kg", e.target.value)}
              />
            </label>
          </div>

          {inputs.category === "spare_parts" && bands.length ? (
            <p className="hint">
              {t("calcBands")}:{" "}
              {bands
                .map((b) => `${b.min}–${b.max} → ×${b.coefficient}`)
                .join(" · ")}
            </p>
          ) : null}
          {inputs.category === "perfume" ? (
            <p className="hint">{t("calcPerfumeStub")}</p>
          ) : null}
          {result?.coefficient_note ? (
            <p className="hint muted-block">{result.coefficient_note}</p>
          ) : null}

          <h3>{t("calcUseCatalogCustoms")}</h3>
          <p className="hint">{t("calcUseCatalogHint")}</p>
          <input
            className="search-input"
            type="search"
            value={catalogQ}
            onChange={(e) => setCatalogQ(e.target.value)}
            placeholder={t("searchPlaceholder")}
            autoComplete="off"
          />
          {catalogLoading ? <p className="status">{t("searching")}</p> : null}
          {catalogHits.length ? (
            <ul className="calc-catalog-hits">
              {catalogHits.map((hit) => (
                <li key={`${hit.catalog_file}-${hit.catalog_row}`}>
                  <button
                    type="button"
                    className="calc-hit-btn"
                    onClick={() => useCatalogCustoms(hit)}
                  >
                    <strong>{hit.product_name}</strong>
                    <span>
                      {t("customsRussia")}: {hit.usd_per_kg} $/kg
                      {hit.country ? ` · ${hit.country}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="calc-results">
          <h3>{t("calcResults")}</h3>
          <p className={`status ${error ? "error" : ""}`}>
            {error || (loading ? t("calcComputing") : "")}
          </p>

          <div className="stats calc-stats">
            <div className="stat">
              <span className="label">{t("calcCbm")}</span>
              <span className="value">{result?.cbm ?? "—"}</span>
            </div>
            <div className="stat">
              <span className="label">{t("density")}</span>
              <span className="value">
                {result?.density_rounded ?? result?.density ?? "—"}
              </span>
            </div>
            <div className="stat">
              <span className="label">{t("calcZ")}</span>
              <span className="value">{result?.transport_z ?? "—"}</span>
            </div>
            <div className="stat">
              <span className="label">{t("calcS")}</span>
              <span className="value">{result?.selling_s ?? "—"}</span>
            </div>
          </div>

          {result?.logistics_amount != null ? (
            <p className="calc-total-line">
              <strong>{t("logisticsAmount")}:</strong>{" "}
              {result.logistics_amount} USD
              <span className="muted-block">
                {" "}
                ({result.selling_s} × {result.chargeable_kg_used} kg)
              </span>
            </p>
          ) : null}

          {result?.pallets_in_container != null ? (
            <p className="hint">
              {t("calcPalletsInBox")}: {result.pallets_in_container}
              {result.est_container_weight_kg != null
                ? ` · ~${result.est_container_weight_kg} kg`
                : ""}
            </p>
          ) : null}

          <h3>{t("calcBreakdown")}</h3>
          <ol className="calc-steps">
            {steps.map((step) => (
              <li key={step.id}>
                <strong>
                  {step.label}
                  {step.value != null ? `: ${step.value} ${step.unit || ""}` : ""}
                </strong>
                <code>{step.formula}</code>
                <span>{step.why}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
