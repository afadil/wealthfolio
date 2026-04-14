import type { Asset } from "@/lib/types";

/** Fields used to build external links (placeholders, StockAnalysis / TradingView heuristics). */
export type ExternalResearchAssetRef = Pick<
  Asset,
  "displayCode" | "instrumentSymbol" | "instrumentExchangeMic" | "instrumentType"
> & {
  /** From `metadata.profile.quoteType` (ETF, EQUITY, …). */
  profileQuoteType?: string | null;
};

export type ExternalResearchOpenMode = "app_window" | "system_browser";

export type ExternalResearchProvider =
  | "yahoo_us"
  | "yahoo_de"
  | "yahoo_ca"
  | "onvista"
  | "financecharts"
  | "tmx";

export interface ExternalResearchProviderConfig {
  provider: ExternalResearchProvider;
  enabled: boolean;
  /** Optional URL template override (supports placeholders, see applyTemplate). */
  urlTemplate?: string;
}

export interface ExternalResearchCustomLink {
  id: string;
  enabled: boolean;
  label: string;
  urlTemplate: string;
  /** When true, this link always opens in the system browser (e.g. to reuse an existing web login). */
  openInSystemBrowser?: boolean;
}

export interface ExternalResearchSettings {
  version: 2;
  openMode: ExternalResearchOpenMode;
  providers: ExternalResearchProviderConfig[];
  customs: ExternalResearchCustomLink[];
}

export interface ExternalResearchLink {
  provider?: ExternalResearchProvider;
  customId?: string;
  url: string;
  labelKey?: string;
  label?: string;
  /** Custom links only: overrides global open mode when true. */
  openInSystemBrowser?: boolean;
}

export const EXTERNAL_RESEARCH_SETTINGS_CHANGED_EVENT = "wealthfolio:external-research-settings-changed";

const STORAGE_KEY = "wealthfolio.externalResearchLinks.v2";
const LEGACY_STORAGE_KEY = "wealthfolio.externalResearchLinks.v1";

const DEFAULT_PROVIDER_TEMPLATES: Record<ExternalResearchProvider, string> = {
  yahoo_us: "https://finance.yahoo.com/quote/{{yahooTicker}}",
  yahoo_de: "https://de.finance.yahoo.com/quote/{{yahooTicker}}",
  yahoo_ca: "https://ca.finance.yahoo.com/quote/{{yahooTicker}}",
  onvista: "https://www.onvista.de/suche/?searchValue={{symbol}}",
  financecharts: "https://www.financecharts.com/stocks/{{financechartsTicker}}",
  tmx: "https://money.tmx.com/en/quote/{{tmxTicker}}",
};

const DEFAULT_PROVIDERS: ExternalResearchProviderConfig[] = (
  Object.keys(DEFAULT_PROVIDER_TEMPLATES) as ExternalResearchProvider[]
).map((provider) => ({
  provider,
  enabled: true,
}));

const DEFAULT_CUSTOMS: ExternalResearchCustomLink[] = [
  { id: "custom-1", enabled: false, label: "", urlTemplate: "", openInSystemBrowser: false },
  { id: "custom-2", enabled: false, label: "", urlTemplate: "", openInSystemBrowser: false },
  { id: "custom-3", enabled: false, label: "", urlTemplate: "", openInSystemBrowser: false },
];

const DEFAULT_SETTINGS: ExternalResearchSettings = {
  version: 2,
  openMode: "app_window",
  providers: DEFAULT_PROVIDERS,
  customs: DEFAULT_CUSTOMS,
};

type Market = "US" | "CA" | "DE" | "CH" | "OTHER";

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "BATS", "IEXG", "XASE"]);
const CA_MICS = new Set(["XTSE", "XTSX", "XCNQ", "NEOE"]);
const DE_MICS = new Set(["XETR", "XFRA", "XBER", "XMUN", "XSTU", "XDUS", "XHAM", "XHAN"]);
/** SIX Swiss Exchange — StockAnalysis uses `/quote/swx/…` for these listings. */
const CH_MICS = new Set(["XSWX"]);

function detectMarket(symbol: string, mic?: string | null): Market {
  const upperMic = (mic ?? "").trim().toUpperCase();
  if (US_MICS.has(upperMic)) return "US";
  if (CA_MICS.has(upperMic)) return "CA";
  if (DE_MICS.has(upperMic)) return "DE";
  if (CH_MICS.has(upperMic)) return "CH";

  const s = symbol.trim().toUpperCase();
  if (s.endsWith(".TO") || s.endsWith(".V") || s.endsWith(".CN")) return "CA";
  // Canadian preferred-share/common suffix patterns often appear without .TO (e.g., LBS.PR.A)
  if (/^[A-Z0-9]+\.PR\.[A-Z0-9]+$/.test(s)) return "CA";
  if (s.endsWith(".DE") || s.endsWith(".F") || s.endsWith(".MU")) return "DE";
  if (s.endsWith(".SW")) return "CH";
  return "OTHER";
}

function toYahooTicker(symbol: string, market: Market): string {
  const raw = symbol.trim().toUpperCase();
  if (!raw) return raw;

  if (market === "CH") {
    if (raw.endsWith(".SW")) return raw;
    return `${raw}.SW`;
  }

  if (market === "CA") {
    // Example: LBS.PR.A -> LBS-PA.TO (Yahoo preferred share convention)
    const preferred = raw.replace(/\.PR\.([A-Z])$/i, "-P$1").replace(/\./g, "-");
    if (
      preferred.endsWith(".TO") ||
      preferred.endsWith(".V") ||
      preferred.endsWith(".CN") ||
      preferred.endsWith(".NE")
    ) {
      return preferred;
    }
    return `${preferred}.TO`;
  }
  return raw;
}

function toTmxTicker(symbol: string): string {
  const raw = symbol.trim().toUpperCase();
  // Yahoo CA preferred format -> TMX format, e.g. LBS-PA.TO -> LBS.PR.A
  const preferred = raw.match(/^([A-Z0-9]+)-P([A-Z])\.TO$/);
  if (preferred) return `${preferred[1]}.PR.${preferred[2]}`;
  if (raw.endsWith(".TO")) return raw.slice(0, -3);
  return raw;
}

/** Root ticker for TradingView `EXCHANGE:ROOT` (MIC-based exchange guess). */
function tradingViewRootTicker(symbol: string, market: Market): string {
  const raw = symbol.trim().toUpperCase();
  if (!raw) return raw;

  if (market === "CA") {
    if (raw.endsWith(".TO")) return raw.slice(0, -3);
    if (raw.endsWith(".V")) return raw.slice(0, -2);
    if (raw.endsWith(".CN")) return raw.slice(0, -3);
    if (raw.endsWith(".NE")) return raw.slice(0, -3);
    return raw;
  }
  if (market === "DE") {
    if (raw.endsWith(".DE")) return raw.slice(0, -3);
    if (raw.endsWith(".F")) return raw.slice(0, -2);
    if (raw.endsWith(".MU")) return raw.slice(0, -3);
    return raw;
  }
  if (market === "CH") {
    if (raw.endsWith(".SW")) return raw.slice(0, -3);
    return raw;
  }
  return raw;
}

function micToTradingViewExchange(mic: string | null | undefined, market: Market): string {
  const m = (mic ?? "").trim().toUpperCase();
  if (market === "CA") {
    if (m === "XTSX" || m === "XCNQ") return "TSXV";
    return "TSX";
  }
  if (market === "DE") {
    return "XETR";
  }
  if (market === "CH") {
    return "SIX";
  }
  if (market === "US") {
    if (m === "XNYS") return "NYSE";
    if (m === "XNAS") return "NASDAQ";
    if (m === "ARCX" || m === "XASE") return "AMEX";
    if (m === "BATS" || m === "IEXG") return "NASDAQ";
    return "NASDAQ";
  }
  return "NASDAQ";
}

function toTradingViewSymbol(symbol: string, market: Market, mic: string | null | undefined): string {
  const root = tradingViewRootTicker(symbol, market);
  const ex = micToTradingViewExchange(mic, market);
  return `${ex}:${root}`;
}

function isEtfLikeForExternalLinks(
  instrumentType?: string | null,
  profileQuoteType?: string | null,
): boolean {
  const qt = (profileQuoteType ?? "").toUpperCase();
  const it = (instrumentType ?? "").toUpperCase();
  return (
    qt === "ETF" ||
    qt === "MUTUALFUND" ||
    qt === "ETP" ||
    it === "ETF" ||
    it === "MUTUALFUND" ||
    it === "ETP"
  );
}

/**
 * Second path segment for `stockanalysis.com/quote/{segment}/ticker/`.
 * US listings use `/stocks/` or `/etf/` instead (no exchange segment).
 * @see https://stockanalysis.com/quote/tsx/HDIV/ (Canada)
 * @see https://stockanalysis.com/quote/etr/JEQP/ (Germany / Xetra-style)
 * @see https://stockanalysis.com/quote/swx/PPGN/ (Switzerland)
 */
function micToStockAnalysisExchangeSlug(mic: string | null | undefined, market: Market): string {
  const m = (mic ?? "").trim().toUpperCase();
  if (market === "CA") {
    if (m === "NEOE") return "neo";
    if (m === "XTSX" || m === "XCNQ") return "tsxv";
    return "tsx";
  }
  if (market === "DE") {
    return "etr";
  }
  if (market === "CH") {
    return "swx";
  }
  return "";
}

function stockAnalysisPlaceholderVars(
  symbol: string,
  market: Market,
  mic: string | null | undefined,
  instrumentType: string | null | undefined,
  profileQuoteType: string | null | undefined,
): Record<string, string> {
  const slug = tradingViewRootTicker(symbol, market).toLowerCase();
  const etf = isEtfLikeForExternalLinks(instrumentType, profileQuoteType);
  const exSlug = micToStockAnalysisExchangeSlug(mic, market);

  const stockanalysisStocksUrl = `https://stockanalysis.com/stocks/${slug}/`;
  const stockanalysisEtfUrl = `https://stockanalysis.com/etf/${slug}/`;
  const stockanalysisQuoteUrl =
    exSlug !== "" && (market === "CA" || market === "DE" || market === "CH")
      ? `https://stockanalysis.com/quote/${exSlug}/${slug}/`
      : "";

  let stockanalysisUrl: string;
  if (stockanalysisQuoteUrl) {
    // CA / DE / CH: canonical pages use `/quote/{exchange}/{ticker}/` (ETFs and equities), not `/etf/` or `/stocks/`.
    stockanalysisUrl = stockanalysisQuoteUrl;
  } else if (etf) {
    stockanalysisUrl = stockanalysisEtfUrl;
  } else {
    stockanalysisUrl = stockanalysisStocksUrl;
  }

  return {
    stockanalysisSlug: slug,
    stockanalysisExchangeSlug: exSlug,
    stockanalysisStocksUrl,
    stockanalysisEtfUrl,
    stockanalysisQuoteUrl,
    stockanalysisUrl,
  };
}

function mergeProviders(saved: ExternalResearchProviderConfig[] | undefined): ExternalResearchProviderConfig[] {
  const byProvider = new Map<ExternalResearchProvider, ExternalResearchProviderConfig>();
  for (const p of DEFAULT_PROVIDERS) {
    byProvider.set(p.provider, { ...p });
  }
  for (const p of saved ?? []) {
    const base = byProvider.get(p.provider);
    if (!base) continue;
    byProvider.set(p.provider, {
      ...base,
      enabled: Boolean(p.enabled),
      urlTemplate: typeof p.urlTemplate === "string" && p.urlTemplate.trim() ? p.urlTemplate.trim() : undefined,
    });
  }
  return DEFAULT_PROVIDERS.map((p) => byProvider.get(p.provider)!);
}

function mergeCustoms(saved: ExternalResearchCustomLink[] | undefined): ExternalResearchCustomLink[] {
  const slots = DEFAULT_CUSTOMS.map((c) => {
    const match = saved?.find((s) => s.id === c.id);
    if (!match) return { ...c };
    return {
      id: c.id,
      enabled: Boolean(match.enabled),
      label: match.label ?? "",
      urlTemplate: match.urlTemplate ?? "",
      openInSystemBrowser: Boolean(match.openInSystemBrowser),
    };
  });
  // If user had extra customs beyond slots, ignore for now (MVP).
  return slots;
}

function migrateFromV1(raw: string): ExternalResearchSettings | null {
  try {
    const parsed = JSON.parse(raw) as ExternalResearchProviderConfig[];
    if (!Array.isArray(parsed)) return null;
    const enabled = new Map<ExternalResearchProvider, boolean>();
    for (const item of parsed) {
      if (item?.provider) enabled.set(item.provider, Boolean(item.enabled));
    }
    const providers = DEFAULT_PROVIDERS.map((p) => ({
      ...p,
      enabled: enabled.has(p.provider) ? Boolean(enabled.get(p.provider)) : p.enabled,
    }));
    return { version: 2, openMode: "app_window", providers, customs: DEFAULT_CUSTOMS };
  } catch {
    return null;
  }
}

export function loadExternalResearchSettings(): ExternalResearchSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        const migrated = migrateFromV1(legacy);
        if (migrated) {
          saveExternalResearchSettings(migrated);
          return migrated;
        }
      }
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<ExternalResearchSettings> | ExternalResearchProviderConfig[];
    if (Array.isArray(parsed)) {
      const migrated = migrateFromV1(raw);
      return migrated ?? DEFAULT_SETTINGS;
    }

    if (parsed && parsed.version === 2) {
      return {
        version: 2,
        openMode: parsed.openMode === "system_browser" ? "system_browser" : "app_window",
        providers: mergeProviders(parsed.providers),
        customs: mergeCustoms(parsed.customs),
      };
    }

    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveExternalResearchSettings(settings: ExternalResearchSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event(EXTERNAL_RESEARCH_SETTINGS_CHANGED_EVENT));
}

/** @deprecated kept for older call sites during refactor */
export function loadExternalResearchConfig(): ExternalResearchProviderConfig[] {
  return loadExternalResearchSettings().providers;
}

/** @deprecated kept for older call sites during refactor */
export function saveExternalResearchConfig(config: ExternalResearchProviderConfig[]): void {
  const current = loadExternalResearchSettings();
  saveExternalResearchSettings({ ...current, providers: mergeProviders(config) });
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

/**
 * Pasted bases without `{{…}}`: Seeking Alpha `/symbol/`; StockAnalysis `/`, `/stocks/`, or `/etf/` → `{{stockanalysisUrl}}`
 * (path is chosen from the asset: ETF vs equity vs Canada).
 */
function expandShorthandCustomTemplate(template: string): string {
  const t = template.trim();
  if (t.includes("{{")) return t;
  try {
    const u = new URL(t);
    if (u.search !== "" || u.hash !== "") return t;
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();

    if (host === "seekingalpha.com") {
      let path = u.pathname.replace(/\/+/g, "/");
      while (path.length > 1 && path.endsWith("/")) {
        path = path.slice(0, -1);
      }
      if (path.toLowerCase() === "/symbol") return "https://seekingalpha.com/symbol/{{symbol}}";
    }

    if (host === "stockanalysis.com") {
      let path = u.pathname.replace(/\/+/g, "/");
      while (path.length > 1 && path.endsWith("/")) {
        path = path.slice(0, -1);
      }
      const pl = path.toLowerCase();
      // `/stocks/` vs `/etf/` is only a hint; the opened URL follows the security (ETF, Canada quote, etc.).
      if (pl === "/stocks" || pl === "/etf" || pl === "" || pl === "/") {
        return "{{stockanalysisUrl}}";
      }
    }

    return t;
  } catch {
    return t;
  }
}

/**
 * Fixes common template mistakes: duplicate path slashes and a trailing slash before ? or #
 * (some sites 404 on e.g. /symbol/AAPL/).
 */
function normalizeOpenedHttpUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return url;
    let p = u.pathname.replace(/\/+/g, "/");
    while (p.length > 1 && p.endsWith("/")) {
      p = p.slice(0, -1);
    }
    u.pathname = p || "/";
    return u.href;
  } catch {
    return url;
  }
}

function providerLabelKey(provider: ExternalResearchProvider): string {
  switch (provider) {
    case "yahoo_us":
      return "asset.profile.external_links.yahoo_us";
    case "yahoo_de":
      return "asset.profile.external_links.yahoo_de";
    case "yahoo_ca":
      return "asset.profile.external_links.yahoo_ca";
    case "onvista":
      return "asset.profile.external_links.onvista";
    case "financecharts":
      return "asset.profile.external_links.financecharts";
    case "tmx":
      return "asset.profile.external_links.tmx";
  }
}

/** Yahoo Finance chart on the US site; ticker uses the same conventions as other Yahoo links (e.g. CA `.TO`). */
export function yahooFinanceChartUrlForAsset(asset: ExternalResearchAssetRef | null | undefined): string | null {
  const displayCode = asset?.displayCode?.trim() ?? "";
  const instrumentSymbol = asset?.instrumentSymbol?.trim() ?? "";
  const symbol = displayCode || instrumentSymbol;
  if (!symbol) return null;
  const market = detectMarket(symbol, asset?.instrumentExchangeMic);
  const yahooTicker = toYahooTicker(symbol, market);
  return normalizeOpenedHttpUrl(`https://finance.yahoo.com/chart/${encodeURIComponent(yahooTicker)}`);
}

export function externalResearchLinksForAsset(
  asset: ExternalResearchAssetRef | null | undefined,
  settings: ExternalResearchSettings,
): ExternalResearchLink[] {
  const displayCode = asset?.displayCode?.trim() ?? "";
  const instrumentSymbol = asset?.instrumentSymbol?.trim() ?? "";
  const symbol = displayCode || instrumentSymbol;
  if (!symbol) return [];

  const market = detectMarket(symbol, asset?.instrumentExchangeMic);
  const yahooTicker = toYahooTicker(symbol, market);
  const tmxTicker = toTmxTicker(symbol);
  const financechartsTicker = instrumentSymbol || displayCode || symbol;
  const tradingviewSymbol = toTradingViewSymbol(symbol, market, asset?.instrumentExchangeMic);
  const tradingviewSymbolQuery = encodeURIComponent(tradingviewSymbol);
  const stockanalysis = stockAnalysisPlaceholderVars(
    symbol,
    market,
    asset?.instrumentExchangeMic,
    asset?.instrumentType,
    asset?.profileQuoteType,
  );

  const vars: Record<string, string> = {
    symbol,
    displayCode: displayCode || symbol,
    instrumentSymbol: instrumentSymbol || symbol,
    yahooTicker,
    tmxTicker,
    financechartsTicker,
    tradingviewSymbol,
    tradingviewSymbolQuery,
    ...stockanalysis,
  };

  const links: ExternalResearchLink[] = [];

  for (const cfg of settings.providers) {
    if (!cfg.enabled) continue;

    const defaultTemplate = DEFAULT_PROVIDER_TEMPLATES[cfg.provider];
    const template = (cfg.urlTemplate?.trim() || defaultTemplate).trim();
    if (!template) continue;

    // FinanceCharts default link is US-only (legacy behavior)
    if (cfg.provider === "financecharts" && market !== "US") continue;

    let url = applyTemplate(template, vars);
    if (!/^https?:\/\//i.test(url)) continue;
    url = normalizeOpenedHttpUrl(url);

    links.push({
      provider: cfg.provider,
      url,
      labelKey: providerLabelKey(cfg.provider),
    });
  }

  for (const custom of settings.customs) {
    if (!custom.enabled) continue;
    const rawTemplate = custom.urlTemplate.trim();
    if (!rawTemplate) continue;
    const template = expandShorthandCustomTemplate(rawTemplate);
    let url = applyTemplate(template, vars);
    if (!/^https?:\/\//i.test(url)) continue;
    url = normalizeOpenedHttpUrl(url);
    const label = custom.label.trim() || template;
    links.push({
      customId: custom.id,
      url,
      label,
      openInSystemBrowser: custom.openInSystemBrowser ? true : undefined,
    });
  }

  return links;
}
