import { HistoryChart } from "@/components/history-chart";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { DateRange, TimePeriod } from "@/lib/types";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { Badge, Card, CardContent, CardHeader, CardTitle, IntervalSelector } from "@wealthfolio/ui";
import { isAfter, parseISO, subMonths } from "date-fns";
import { useMemo, useState } from "react";

interface ValuationHistoryArgs {
  accountId?: string;
  startDate?: string;
  endDate?: string;
}

interface ValuationHistoryPoint {
  valuationDate: string;
  totalValue: number;
  netContribution: number;
  baseCurrency: string;
}

interface ValuationHistoryResult {
  accountId: string;
  accountName?: string | null;
  baseCurrency: string;
  valuations: ValuationHistoryPoint[];
}

const getInitialDateRange = (): DateRange => ({
  from: subMonths(new Date(), 3),
  to: new Date(),
});

const normalizeResult = (result: unknown): ValuationHistoryResult | null => {
  if (!result) {
    return null;
  }

  if (typeof result === "string") {
    try {
      return normalizeResult(JSON.parse(result));
    } catch {
      return null;
    }
  }

  if (typeof result !== "object" || result === null) {
    return null;
  }

  const candidate = result as Record<string, unknown>;
  const valuationsRaw = Array.isArray(candidate.valuations) ? candidate.valuations : [];
  const baseCurrency =
    (candidate.baseCurrency as string | undefined) ??
    (candidate.base_currency as string | undefined) ??
    "USD";

  const valuations: ValuationHistoryPoint[] = valuationsRaw
    .map((entry) => entry as Record<string, unknown>)
    .map((entry) => ({
      valuationDate:
        (entry.valuationDate as string | undefined) ??
        (entry.valuation_date as string | undefined) ??
        "",
      totalValue: Number(
        (entry.totalValue as number | string | undefined) ??
          (entry.total_value as number | string | undefined) ??
          0,
      ),
      netContribution: Number(
        (entry.netContribution as number | string | undefined) ??
          (entry.net_contribution as number | string | undefined) ??
          0,
      ),
      baseCurrency:
        (entry.baseCurrency as string | undefined) ??
        (entry.base_currency as string | undefined) ??
        baseCurrency,
    }))
    .filter((entry) => Boolean(entry.valuationDate));

  return {
    accountId:
      (candidate.accountId as string | undefined) ??
      (candidate.account_id as string | undefined) ??
      PORTFOLIO_ACCOUNT_ID,
    accountName:
      (candidate.accountName as string | undefined) ??
      (candidate.account_name as string | undefined) ??
      null,
    baseCurrency,
    valuations,
  };
};

export const ValuationHistoryToolUI = makeAssistantToolUI<
  ValuationHistoryArgs,
  ValuationHistoryResult
>({
  toolName: "get_valuation_history",
  render: ({ args, result, status, ...partProps }) => {
    // Hooks are not allowed directly inside render; delegate to a component
    return <ValuationHistoryContent args={args} result={result} status={status} {...partProps} />;
  },
});

type ValuationHistoryContentProps = Parameters<
  Parameters<typeof makeAssistantToolUI>[0]["render"]
>[0];

function ValuationHistoryContent({ args, result, status }: ValuationHistoryContentProps) {
  const { isBalanceHidden } = useBalancePrivacy();
  const [period, setPeriod] = useState<TimePeriod>("3M");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(getInitialDateRange());
    const parsed = normalizeResult(result);
    const chartData = useMemo(() => {
      if (!parsed?.valuations) return [];

      const fromDate = period === "ALL" ? undefined : dateRange?.from;
      const toDate = dateRange?.to;
      return parsed.valuations
        .filter((valuation) => {
          if (!fromDate && !toDate) return true;
          const valuationDate = parseISO(valuation.valuationDate);
          if (fromDate && isAfter(fromDate, valuationDate)) {
            return false;
          }
          if (toDate && isAfter(valuationDate, toDate)) {
            return false;
          }
          return true;
        })
        .map((valuation) => ({
          date: valuation.valuationDate,
          totalValue: valuation.totalValue,
          netContribution: valuation.netContribution,
          currency: valuation.baseCurrency ?? parsed.baseCurrency,
        }));
    }, [parsed?.valuations, parsed?.baseCurrency, period, dateRange?.from, dateRange?.to]);

    const accountLabel =
      parsed?.accountName ??
      parsed?.accountId ??
      args?.accountId ??
      PORTFOLIO_ACCOUNT_ID;

    const isLoading = status?.type === "running" && chartData.length === 0;
    const isComplete =
      status?.type === "complete" || status?.type === "incomplete";
    const shouldRenderChart = chartData.length > 0 && isComplete;
    const hasData = chartData.length > 0;

    const handleIntervalSelect = (
      code: TimePeriod,
      _description: string,
      range: DateRange | undefined,
    ) => {
      setPeriod(code);
      setDateRange(range);
    };

    return (
      <Card className="bg-muted/40 border-primary/10">
        <CardHeader className="flex flex-col gap-2 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Valuation history</CardTitle>
              <Badge variant="secondary" className="uppercase">
                {accountLabel}
              </Badge>
            </div>
            <IntervalSelector
              onIntervalSelect={handleIntervalSelect}
              isLoading={status?.type === "running"}
              initialSelection={period}
              className="w-full max-w-xs"
            />
          </div>
          {(args?.startDate || args?.endDate) && (
            <p className="text-muted-foreground text-xs">
              Range {args?.startDate ?? "start"} - {args?.endDate ?? "latest"}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="h-[240px] w-full min-w-[280px] rounded-xl border bg-background/60 p-3 shadow-inner">
            {shouldRenderChart ? (
              <HistoryChart
                data={chartData}
                isLoading={isLoading}
                disableAnimation
                isBalanceHidden={isBalanceHidden}
              />
            ) : (
              <div className="text-muted-foreground flex h-full items-center justify-center rounded-md border border-dashed px-3 text-sm">
                {isLoading
                  ? "Fetching valuation history..."
                  : hasData
                    ? "Preparing chart..."
                    : "No valuation history available."}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
}
