import { cn } from "../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

interface TickerAvatarProps {
  symbol: string;
  exchangeMic?: string;
  className?: string;
}

const MIC_TO_YAHOO_SUFFIX: Record<string, string> = {
  XTSE: "TO",
  XTSX: "V",
  XCNQ: "CN",
  XMEX: "MX",
  XLON: "L",
  XDUB: "IR",
  XETR: "DE",
  XFRA: "F",
  XSTU: "SG",
  XHAM: "HM",
  XDUS: "DU",
  XMUN: "MU",
  XBER: "BE",
  XHAN: "HA",
  XPAR: "PA",
  XAMS: "AS",
  XBRU: "BR",
  XLIS: "LS",
  XMIL: "MI",
  XMAD: "MC",
  XATH: "AT",
  XSTO: "ST",
  XHEL: "HE",
  XCSE: "CO",
  XOSL: "OL",
  XICE: "IC",
  XSWX: "SW",
  XWBO: "VI",
  XWAR: "WA",
  XPRA: "PR",
  XBUD: "BD",
  XIST: "IS",
  XSHG: "SS",
  XSHE: "SZ",
  XHKG: "HK",
  XTKS: "T",
  XKRX: "KS",
  XKOS: "KQ",
  XSES: "SI",
  XBKK: "BK",
  XIDX: "JK",
  XKLS: "KL",
  XBOM: "BO",
  XNSE: "NS",
  XTAI: "TW",
  XASX: "AX",
  XNZE: "NZ",
  BVMF: "SA",
  XBUE: "BA",
  XSGO: "SN",
  XTAE: "TA",
  XSAU: "SAU",
  XDFM: "AE",
  DSMD: "QA",
  XJSE: "JO",
  XCAI: "CA",
};

const KNOWN_YAHOO_SUFFIXES = new Set(Object.values(MIC_TO_YAHOO_SUFFIX));

function stripKnownYahooSuffix(symbol: string): { baseSymbol: string; hasKnownSuffix: boolean } {
  const trimmed = symbol.trim().toUpperCase();
  const dot = trimmed.lastIndexOf(".");
  if (dot < 0) {
    return { baseSymbol: trimmed, hasKnownSuffix: false };
  }

  const suffix = trimmed.slice(dot + 1);
  if (!KNOWN_YAHOO_SUFFIXES.has(suffix)) {
    return { baseSymbol: trimmed, hasKnownSuffix: false };
  }

  return {
    baseSymbol: trimmed.slice(0, dot),
    hasKnownSuffix: true,
  };
}

export const TickerAvatar = ({ symbol, exchangeMic, className = "size-8" }: TickerAvatarProps) => {
  const fallbackBaseSymbol = symbol ? symbol.split(/[.:-]/)[0].toUpperCase() : "";
  const fullSymbol = symbol ? symbol.toUpperCase() : "";
  const normalizedExchangeMic = exchangeMic?.trim().toUpperCase();
  const { baseSymbol, hasKnownSuffix } = stripKnownYahooSuffix(fullSymbol);
  const derivedSuffix =
    !hasKnownSuffix && normalizedExchangeMic ? MIC_TO_YAHOO_SUFFIX[normalizedExchangeMic] : undefined;
  const primarySymbol = derivedSuffix ? `${baseSymbol}.${derivedSuffix}` : fullSymbol;
  const allowBaseFallback = !hasKnownSuffix && !derivedSuffix;

  const primaryLogoUrl = primarySymbol ? `/ticker-logos/${primarySymbol}.png` : "";
  const fallbackLogoUrl =
    allowBaseFallback && fallbackBaseSymbol ? `/ticker-logos/${fallbackBaseSymbol}.png` : undefined;

  return (
    <Avatar className={cn("bg-primary/80 dark:bg-primary/20 border-white/20 backdrop-blur-md", className)}>
      <AvatarImage src={primaryLogoUrl} alt={fullSymbol} className="object-contain p-2" />
      <AvatarFallback>
        <Avatar className="bg-primary/80 dark:bg-primary/20 border-white/20 text-white backdrop-blur-md">
          <AvatarImage src={fallbackLogoUrl} alt={fullSymbol} className="object-contain p-2" />
          <AvatarFallback className="bg-transparent text-xs font-medium">
            <span className="p-1" title={fullSymbol}>
              {fallbackBaseSymbol ? fallbackBaseSymbol.slice(0, 4) : "•"}
            </span>
          </AvatarFallback>
        </Avatar>
      </AvatarFallback>
    </Avatar>
  );
};
