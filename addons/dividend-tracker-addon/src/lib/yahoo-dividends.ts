const MIC_TO_YAHOO_SUFFIX: Record<string, string> = {
  XTSE: ".TO",
  XTSX: ".V",
  XCNQ: ".CN",
  XNEO: ".NE",
  XMEX: ".MX",
  XLON: ".L",
  XLON_IL: ".IL",
  XDUB: ".IR",
  XETR: ".DE",
  XFRA: ".F",
  XSTU: ".SG",
  XHAM: ".HM",
  XDUS: ".DU",
  XMUN: ".MU",
  XBER: ".BE",
  XHAN: ".HA",
  XPAR: ".PA",
  XAMS: ".AS",
  XBRU: ".BR",
  XLIS: ".LS",
  XMIL: ".MI",
  XMAD: ".MC",
  XATH: ".AT",
  XSTO: ".ST",
  XHEL: ".HE",
  XCSE: ".CO",
  XOSL: ".OL",
  XICE: ".IC",
  XSWX: ".SW",
  XWBO: ".VI",
  XWAR: ".WA",
  XPRA: ".PR",
  XBUD: ".BD",
  XIST: ".IS",
  XSHG: ".SS",
  XSHE: ".SZ",
  XHKG: ".HK",
  XTKS: ".T",
  XKRX: ".KS",
  XKOS: ".KQ",
  XSES: ".SI",
  XBKK: ".BK",
  XIDX: ".JK",
  XKLS: ".KL",
  XBOM: ".BO",
  XNSE: ".NS",
  XTAI: ".TW",
  XTAI_OTC: ".TWO",
  XASX: ".AX",
  XNZE: ".NZ",
  BVMF: ".SA",
  XBUE: ".BA",
  XSGO: ".SN",
};

export function toYahooSymbol(symbol: string, mic?: string | null): string {
  const suffix = mic ? (MIC_TO_YAHOO_SUFFIX[mic] ?? "") : "";
  return symbol + suffix;
}

import type { LoggerAPI } from "@wealthfolio/addon-sdk";

export interface YahooDividend {
  amount: number;
  date: number; // unix seconds
}

type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

function getTauriInvoke(): TauriInvoke | null {
  const tauri = (window as unknown as { __TAURI__?: { core?: { invoke?: TauriInvoke } } })
    .__TAURI__;
  return tauri?.core?.invoke ?? null;
}

export async function fetchYahooDividends(
  symbol: string,
  logger: LoggerAPI,
): Promise<YahooDividend[]> {
  logger.debug(`Fetching dividends for ${symbol}`);

  const invoke = getTauriInvoke();
  if (!invoke) {
    logger.error("Tauri invoke not available");
    throw new Error("Tauri invoke not available");
  }

  try {
    const data = (await invoke("fetch_yahoo_dividends", { symbol })) as YahooDividend[];
    logger.debug(`Found ${data.length} dividends for ${symbol}`);
    return data;
  } catch (err) {
    logger.error(`Failed to fetch dividends for ${symbol}: ${String(err)}`);
    throw err;
  }
}
