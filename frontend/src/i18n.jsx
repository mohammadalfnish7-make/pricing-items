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
    lede: "Upload a CSV or Excel list. $/kg = Итого ÷ gross kg is Russian customs (order: E÷N · CSV: F÷Q). Use Calculator for transport Z and selling S.",
    navPricing: "Pricing",
    navCalculator: "Calculator",
    navQuotes: "Quotes",
    calcTitle: "Note formula calculator",
    calcHint:
      "Three steps from the note: CBM → density → transport Z, then S = (Z + Russian customs) × coefficient.",
    calcResetExample: "Reset example",
    calcPallet: "Pallet & freight",
    calcCustomsBlock: "Customs & coefficient",
    calcCustomsHint:
      "Customs is Russian $/kg from the sheet (Итого ÷ gross). Not the customer selling price.",
    customsRussia: "Customs Russia ($/kg)",
    customsFromCatalog: "from catalog",
    catPerfume: "Perfume (manual coeff)",
    calcBands: "Spare-parts bands",
    calcPerfumeStub: "Perfume origins (UAE / TR / France / Italy) — coefficient table not configured yet; enter coeff manually.",
    calcUseCatalogCustoms: "Fill customs from catalog",
    calcUseCatalogHint: "Search a product; click a row to use its Итого÷gross as Russian customs.",
    calcResults: "Results",
    calcComputing: "Computing…",
    calcCbm: "CBM (ω)",
    calcZ: "Transport Z",
    calcS: "Selling S",
    calcBreakdown: "Step breakdown",
    calcPalletsInBox: "Pallets in container",
    useInCalculator: "Use in calculator",
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
    quotesTitle: "Customer quotations",
    quotesHint:
      "Build a final quote: catalog goods cost, transport/customs (CBM → Z → S), extras, and per-piece declared values.",
    quotesList: "List",
    quotesEdit: "Edit",
    quotesBreakdown: "Breakdown",
    newQuote: "New quotation",
    createQuoteFromResults: "Create quotation",
    quoteSeedReady: "Ready to quote {n} line(s) from {name}.",
    noQuotesYet: "No saved quotations yet.",
    quoteTitle: "Title",
    status: "Status",
    customer: "Customer",
    updated: "Updated",
    open: "Open",
    saving: "Saving…",
    statusDraft: "Draft",
    statusReviewed: "Reviewed",
    statusIssued: "Issued",
    logisticsTitle: "Transport & customs",
    logisticsHint:
      "CBM from cm dimensions. Z = density × container m³ ÷ freight. S = (Z + customs) × coefficient.",
    widthCm: "Width (cm)",
    lengthCm: "Length (cm)",
    heightCm: "Height (cm)",
    weightKg: "Weight (kg)",
    containerM3: "Container (m³)",
    freightTotal: "Freight total",
    customs: "Customs ($/kg)",
    chargeableKg: "Chargeable kg",
    defaultGross: "default: gross",
    category: "Category",
    catSpareParts: "Spare parts",
    catUnclassified: "Unclassified (manual coeff)",
    coefficientManual: "Coefficient (manual)",
    autoFromBand: "auto from band",
    density: "Density kg/CBM",
    invertedZCheck: "Inverted Z check",
    invertedZHint: "Read-only check figure: freight ÷ (density × container). Not used for pricing.",
    coeff: "Coefficient",
    extrasTitle: "Extra charges",
    reason: "Reason",
    linesTitle: "Goods lines & declared values",
    declaredHint:
      "Declared value is for loss/damage only — not the selling price. Every piece must be filled before Issue.",
    qty: "Qty",
    grossKg: "Gross kg",
    goodsCost: "Goods cost",
    declaredPieces: "Declared pieces",
    declaredTotal: "Declared total",
    autoComputed: "auto",
    logisticsAmount: "Logistics",
    customerTotal: "Customer total",
    markReviewed: "Mark reviewed",
    issueQuote: "Issue quotation",
    issueHint:
      "Issue freezes the breakdown. Declared values must be > 0 on every piece. Issued quotes cannot be edited.",
    frozenSnapshot: "frozen snapshot",
    liabilityRule:
      "Liability is per declared piece. Compensation uses the affected piece's declared value, not weight.",
    charges: "Charges",
    charge: "Charge",
    amount: "Amount",
    formula: "How calculated",
    overridden: "override",
  },
  ru: {
    pricing: "Прайс",
    signIn: "Войти",
    signingIn: "Вход…",
    signOut: "Выйти",
    loading: "Загрузка…",
    username: "Логин",
    password: "Пароль",
    lede: "Загрузите CSV или Excel. $/кг = Итого ÷ брутто — российская таможня (заказ: E÷N · CSV: F÷Q). Калькулятор считает транспорт Z и цену S.",
    navPricing: "Прайс",
    navCalculator: "Калькулятор",
    navQuotes: "Котировки",
    calcTitle: "Калькулятор по формуле из записки",
    calcHint:
      "Три шага: CBM → плотность → транспорт Z, затем S = (Z + таможня РФ) × коэффициент.",
    calcResetExample: "Сброс к примеру",
    calcPallet: "Паллета и фрахт",
    calcCustomsBlock: "Таможня и коэффициент",
    calcCustomsHint:
      "Таможня — российский $/кг с листа (Итого ÷ брутто). Это не цена продажи клиенту.",
    customsRussia: "Таможня РФ ($/кг)",
    customsFromCatalog: "из каталога",
    catPerfume: "Парфюм (ручной коэф.)",
    calcBands: "Диапазоны запчастей",
    calcPerfumeStub: "Парфюм (ОАЭ / TR / Франция / Италия) — таблица коэффициентов ещё не задана; введите коэф. вручную.",
    calcUseCatalogCustoms: "Подставить таможню из каталога",
    calcUseCatalogHint: "Найдите товар; нажмите строку — Итого÷брутто станет таможенным $/кг.",
    calcResults: "Результат",
    calcComputing: "Расчёт…",
    calcCbm: "CBM (ω)",
    calcZ: "Транспорт Z",
    calcS: "Цена S",
    calcBreakdown: "Пошаговая расшифровка",
    calcPalletsInBox: "Паллет в контейнере",
    useInCalculator: "В калькулятор",
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
    quotesTitle: "Котировки для клиента",
    quotesHint:
      "Итоговая котировка: себестоимость из каталога, транспорт/таможня (CBM → Z → S), доп. расходы и заявленная стоимость по штукам.",
    quotesList: "Список",
    quotesEdit: "Редактор",
    quotesBreakdown: "Расшифровка",
    newQuote: "Новая котировка",
    createQuoteFromResults: "Создать котировку",
    quoteSeedReady: "Готово к котировке: {n} поз. из {name}.",
    noQuotesYet: "Сохранённых котировок пока нет.",
    quoteTitle: "Название",
    status: "Статус",
    customer: "Клиент",
    updated: "Обновлено",
    open: "Открыть",
    saving: "Сохранение…",
    statusDraft: "Черновик",
    statusReviewed: "Проверено",
    statusIssued: "Выпущено",
    logisticsTitle: "Транспорт и таможня",
    logisticsHint:
      "CBM из размеров в см. Z = плотность × объём контейнера ÷ фрахт. S = (Z + таможня) × коэффициент.",
    widthCm: "Ширина (см)",
    lengthCm: "Длина (см)",
    heightCm: "Высота (см)",
    weightKg: "Вес (кг)",
    containerM3: "Контейнер (м³)",
    freightTotal: "Фрахт всего",
    customs: "Таможня ($/кг)",
    chargeableKg: "Оплачиваемый кг",
    defaultGross: "по умолч.: брутто",
    category: "Категория",
    catSpareParts: "Запчасти",
    catUnclassified: "Без категории (ручной коэф.)",
    coefficientManual: "Коэффициент (вручную)",
    autoFromBand: "авто из диапазона",
    density: "Плотность кг/CBM",
    invertedZCheck: "Проверка Z (инверсия)",
    invertedZHint: "Только проверка: фрахт ÷ (плотность × контейнер). В расчёт не входит.",
    coeff: "Коэффициент",
    extrasTitle: "Доп. расходы",
    reason: "Причина",
    linesTitle: "Товары и заявленная стоимость",
    declaredHint:
      "Заявленная стоимость — только для ущерба/утери, не цена продажи. Перед выпуском заполните каждую штуку.",
    qty: "Кол-во",
    grossKg: "Брутто кг",
    goodsCost: "Себестоимость",
    declaredPieces: "Штуки (заявлено)",
    declaredTotal: "Заявлено итого",
    autoComputed: "авто",
    logisticsAmount: "Логистика",
    customerTotal: "Итого клиенту",
    markReviewed: "Отметить проверенным",
    issueQuote: "Выпустить котировку",
    issueHint:
      "Выпуск фиксирует расшифровку. У каждой штуки declared_value > 0. Выпущенные котировки нельзя менять.",
    frozenSnapshot: "зафиксированный снимок",
    liabilityRule:
      "Ответственность по каждой заявленной штуке. Компенсация — по стоимости штуки, не по весу.",
    charges: "Начисления",
    charge: "Статья",
    amount: "Сумма",
    formula: "Как посчитано",
    overridden: "правка",
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
