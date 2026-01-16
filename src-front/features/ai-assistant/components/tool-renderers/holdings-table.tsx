import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wealthfolio/ui/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ToolRendererProps, HoldingDto } from "./types";

interface HoldingsTableProps extends ToolRendererProps<HoldingDto[]> {
  currency?: string;
}

export function HoldingsTable({ data, meta, currency = "USD" }: HoldingsTableProps) {
  if (!data?.length) {
    return (
      <Card className="w-full">
        <CardContent className="py-4">
          <p className="text-muted-foreground text-sm">No holdings data available.</p>
        </CardContent>
      </Card>
    );
  }

  const formatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  const percentFormatter = new Intl.NumberFormat(undefined, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  });

  // Compute totals
  const totalValue = data.reduce((sum, h) => sum + h.marketValueBase, 0);
  const totalCostBasis = data.reduce((sum, h) => sum + (h.costBasisBase ?? 0), 0);
  const totalGain = totalValue - totalCostBasis;
  const totalGainPct = totalCostBasis > 0 ? totalGain / totalCostBasis : 0;

  return (
    <Card className="w-full overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-medium">Holdings</CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              {data.length} position{data.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {meta?.accountScope && meta.accountScope !== "TOTAL" && (
              <Badge variant="outline" className="text-xs">
                {meta.accountScope}
              </Badge>
            )}
            {meta?.truncated && (
              <Badge variant="secondary" className="text-xs">
                {meta.returnedCount} / {meta.originalCount}
              </Badge>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-2">
          <span className="text-xl font-bold">{formatter.format(totalValue)}</span>
          <span
            className={cn(
              "text-sm font-medium",
              totalGain >= 0 ? "text-success" : "text-destructive"
            )}
          >
            {totalGain >= 0 ? "+" : ""}
            {formatter.format(totalGain)} ({percentFormatter.format(totalGainPct)})
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4 text-xs">Symbol</TableHead>
                <TableHead className="text-right text-xs">Value</TableHead>
                <TableHead className="hidden text-right text-xs sm:table-cell">Weight</TableHead>
                <TableHead className="pr-4 text-right text-xs">Gain</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((holding) => (
                <TableRow key={`${holding.accountId}-${holding.symbol}`} className="text-xs">
                  <TableCell className="pl-4 py-2">
                    <div>
                      <div className="font-medium">{holding.symbol}</div>
                      {holding.name && (
                        <div className="text-muted-foreground max-w-[120px] truncate text-[10px] sm:max-w-[200px]">
                          {holding.name}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-right font-medium tabular-nums">
                    {formatter.format(holding.marketValueBase)}
                  </TableCell>
                  <TableCell className="hidden py-2 text-right tabular-nums sm:table-cell">
                    {(holding.weight * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell className="pr-4 py-2 text-right">
                    {holding.unrealizedGainPct != null ? (
                      <span
                        className={cn(
                          "tabular-nums",
                          holding.unrealizedGainPct >= 0 ? "text-success" : "text-destructive"
                        )}
                      >
                        {percentFormatter.format(holding.unrealizedGainPct / 100)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
