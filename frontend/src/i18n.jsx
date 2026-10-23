import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "pricing_lang";

export const MESSAGES = {
  en: {
    pricing: "Pricing",
    signIn: "Sign in",
    signingIn: "Signing in…",
    signOut: "Sign out",
    loading: "Loading…",
    username: "Username",
    password: "Password",
    lede: "Upload a CSV or Excel list. Actual $/kg = Итого ÷ gross kg (order file: E÷N · merged CSV: F÷Q). Two match pages: strict and fuzzy.",
    searchTitle: "Search catalog",
    searchHint: "Type a product name — results update as you type.",
    searchPlaceholder: "Type: накладка бампера, амортизатор…",
    strict: "Strict",
    fuzzy: "Fuzzy",
    searching: "Searching…",
    searchFailed: "Search failed",
    matchesOne: "{n} match",
    matchesMany: "{n} matches",
    product: "Product",
    perKg: "$/kg",
    match: "Match",
    matchTitle: "How closely the name matches a catalog product. Higher is better.",
    country: "Country",
    order: "Order",
    csvRow: "CSV row",
    catalog: "catalog",
    items: "Items",
    pricedLines: "Priced lines",
    catalogMatch: "Catalog match",
    total: "Total",
    countryDiff: "Country differences on {n} line(s) — check the Country column.",
    pageStrict: "Page 1 — Strict match",
    pageStrictHint: "closer name match only.",
    pageFuzzy: "Page 2 — Fuzzy match",
    pageFuzzyHint: "looser name matching (not specific). Review refs carefully.",
    matchNote: "Match = name closeness (1.00 is strong)",
    downloadRefs: "Download refs CSV",
    sourceOrder: "Source order",
    reference: "Reference",
    matched: "matched: {name}",
    noCatalogMatch: "no catalog match",
    unmatched: "unmatched",
    dropTitle: "Drop your items file",
    dropHint: "Accepts .csv, .xlsx, and .xls — order exports or name lists.",
    chooseFile: "Choose file",
    pricingNow: "Pricing…",
    rerun: "Re-run",
    selected: "Selected: {name}",
    parsing: "Parsing and pricing items…",
    genericError: "Something went wrong",
    loginFailed: "Login failed",
    invalidLogin: "Invalid email or password",
    notAuthenticated: "Not authenticated",
    requestFailed: "Request failed",
    matchPages: "Match pages",
    page1Strict: "Page 1 · Strict",
    page2Fuzzy: "Page 2 · Fuzzy",
  },
  ru: {
    pricing: "Прайс",
    signIn: "Войти",
    signingIn: "Вход…",
    signOut: "Выйти",
    loading: "Загрузка…",
    username: "Логин",
    password: "Пароль",
    lede: "Загрузите CSV или Excel. Фактическая цена $/кг = Итого ÷ вес брутто, кг (заказ: E÷N · сводный CSV: F÷Q). Две страницы: точное и нечёткое совпадение.",
    searchTitle: "Поиск по каталогу",
    searchHint: "Введите название товара — результаты появляются сразу.",
    searchPlaceholder: "Например: накладка бампера, амортизатор…",
    strict: "Точный",
    fuzzy: "Нечёткий",
    searching: "Поиск…",
    searchFailed: "Ошибка поиска",
    matchesOne: "{n} совпадение",
    matchesMany: "{n} совпадений",
    product: "Товар",
    perKg: "$/кг",
    match: "Совпадение",
    matchTitle: "Насколько название совпадает с товаром в каталоге. Чем выше, тем лучше.",
    country: "Страна",
    order: "Заказ",
    csvRow: "Строка CSV",
    catalog: "каталог",
    items: "Позиции",
    pricedLines: "С ценой",
    catalogMatch: "Совпадения",
    total: "Итого",
    countryDiff: "Различия по странам в {n} строках — проверьте колонку «Страна».",
    pageStrict: "Страница 1 — точное совпадение",
    pageStrictHint: "только близкие названия.",
    pageFuzzy: "Страница 2 — нечёткое совпадение",
    pageFuzzyHint: "более свободный поиск. Проверьте источники.",
    matchNote: "Совпадение = близость названия (1.00 — сильное)",
    downloadRefs: "Скачать CSV со ссылками",
    sourceOrder: "Исходный заказ",
    reference: "Источник",
    matched: "совпадение: {name}",
    noCatalogMatch: "нет в каталоге",
    unmatched: "нет совпадения",
    dropTitle: "Перетащите файл со списком",
    dropHint: "Форматы .csv, .xlsx и .xls — заказы или списки названий.",
    chooseFile: "Выбрать файл",
    pricingNow: "Расчёт…",
    rerun: "Повторить",
    selected: "Выбран: {name}",
    parsing: "Разбор и расчёт позиций…",
    genericError: "Что-то пошло не так",
    loginFailed: "Не удалось войти",
    invalidLogin: "Неверный логин или пароль",
    notAuthenticated: "Нет доступа",
    requestFailed: "Ошибка запроса",
    matchPages: "Страницы совпадений",
    page1Strict: "Стр. 1 · Точный",
    page2Fuzzy: "Стр. 2 · Нечёткий",
  },
};

const ERROR_MAP = {
  "Invalid email or password": "invalidLogin",
  "Not authenticated": "notAuthenticated",
  "Login failed": "loginFailed",
  "Search failed": "searchFailed",
  "Something went wrong": "genericError",
  "Request failed": "requestFailed",
};

function detectLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "ru" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  const nav = (navigator.language || "").toLowerCase();
  return nav.startsWith("ru") ? "ru" : "en";
}

function format(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] == null ? "" : String(vars[key])
  );
}

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detectLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  const value = useMemo(() => {
    const dict = MESSAGES[lang] || MESSAGES.en;
    const t = (key, vars) => format(dict[key] || MESSAGES.en[key] || key, vars);
    const setLang = (next) => {
      if (next === "ru" || next === "en") setLangState(next);
    };
    const translateError = (message) => {
      const mapped = ERROR_MAP[message];
      return mapped ? t(mapped) : message;
    };
    return { lang, setLang, t, translateError, locale: lang === "ru" ? "ru-RU" : "en-US" };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

export function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label="Language">
      <button
        type="button"
        className={lang === "en" ? "active" : ""}
        onClick={() => setLang("en")}
      >
        EN
      </button>
      <button
        type="button"
        className={lang === "ru" ? "active" : ""}
        onClick={() => setLang("ru")}
      >
        RU
      </button>
    </div>
  );
}
