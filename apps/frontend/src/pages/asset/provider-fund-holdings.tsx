import type { FundHoldingRow } from "./asset-utils";
import { openUrlInAppWebviewWindow } from "@/adapters";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wealthfolio/ui/components/ui/table";
import { useTranslation } from "react-i18next";

interface ProviderFundHoldingsProps {
  rows: FundHoldingRow[];
}

function formatWeightPct(weight: number): string {
  const p = weight <= 1 && weight >= 0 ? weight * 100 : weight;
  return `${p.toFixed(2)}%`;
}

/** Long name next to the ticker column (symbol is shown separately; avoid duplicating it). */
function holdingNamePart(row: FundHoldingRow, hasTicker: boolean): string {
  if (!hasTicker) {
    return (row.description || row.name).trim();
  }
  const sym = (row.symbol ?? "").trim();
  const desc = row.description?.trim() ?? "";
  if (desc) return desc;
  const nm = row.name?.trim() ?? "";
  if (nm && nm !== sym) return nm;
  return "";
}

/** Yahoo Finance chart (interactive chart page for the symbol). */
export function yahooFinanceChartUrl(symbol: string): string {
  return `https://finance.yahoo.com/chart/${encodeURIComponent(symbol.trim())}`;
}

/** Yahoo topHoldings.holdings — largest positions inside the fund (not your portfolio accounts). */
export function ProviderFundHoldings({ rows }: ProviderFundHoldingsProps) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;

  const openYahooChart = (symbol: string) => {
    const s = symbol.trim();
    if (!s) return;
    void openUrlInAppWebviewWindow(yahooFinanceChartUrl(s), `Yahoo · ${s}`);
  };

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">{t("asset.profile.provider_holdings_title")}</h4>
      <div className="scrollbar-hide overflow-x-auto rounded-md border [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Table className="table-fixed w-full min-w-[28rem] text-sm">
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="text-muted-foreground w-[14ch] max-w-[20ch] px-3 py-2 font-medium">
                {t("asset.profile.provider_holdings_col_symbol")}
              </TableHead>
              <TableHead className="text-muted-foreground min-w-0 px-3 py-2 font-medium">
                {t("asset.profile.provider_holdings_col_name")}
              </TableHead>
              <TableHead className="text-muted-foreground min-w-[6.5rem] shrink-0 whitespace-nowrap px-3 py-2 pe-4 text-right font-medium">
                {t("asset.profile.provider_holdings_col_weight")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => {
              const pct = formatWeightPct(row.weight);
              const hasTicker = Boolean(row.symbol?.trim());
              const namePart = holdingNamePart(row, hasTicker);
              const sym = row.symbol?.trim() ?? "";
              return (
                <TableRow key={`${row.symbol}-${row.name}-${i}`}>
                  <TableCell className="align-top px-3 py-2">
                    {hasTicker ? (
                      <button
                        type="button"
                        onClick={() => openYahooChart(sym)}
                        className="text-primary cursor-pointer rounded-sm font-mono text-sm underline decoration-primary/80 underline-offset-2 hover:text-primary/90 focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                        title={t("asset.profile.provider_holdings_ticker_link_title")}
                        aria-label={t("asset.profile.provider_holdings_open_yahoo_aria", {
                          symbol: sym,
                        })}
                      >
                        {sym}
                      </button>
                    ) : (
                      <span
                        className="text-muted-foreground select-none font-mono text-sm"
                        title={t("asset.profile.fund_holding_ticker_missing_title")}
                      >
                        —
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-foreground min-w-0 align-top break-words px-3 py-2">
                    {namePart || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground min-w-[6.5rem] shrink-0 whitespace-nowrap align-top tabular-nums px-3 py-2 pe-4 text-right">
                    {pct}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
