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

export interface YahooDividend {
  amount: number;
  date: number; // unix seconds
}

export async function fetchYahooDividends(symbol: string): Promise<YahooDividend[]> {
  const now = Math.floor(Date.now() / 1000);
  const twoYearsAgo = now - 2 * 365 * 24 * 60 * 60;

  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1d&period1=${twoYearsAgo}&period2=${now}&events=div`;

  const resp = await fetch(url, { headers: { Accept: "application/json" } });

  if (!resp.ok) {
    throw new Error(`Yahoo Finance returned ${resp.status} for ${symbol}`);
  }

  const json = (await resp.json()) as {
    chart?: {
      result?: Array<{
        events?: {
          dividends?: Record<string, YahooDividend>;
        };
      }>;
    };
  };

  const dividends = json?.chart?.result?.[0]?.events?.dividends;
  if (!dividends) return [];

  return Object.values(dividends).sort((a, b) => a.date - b.date);
}
