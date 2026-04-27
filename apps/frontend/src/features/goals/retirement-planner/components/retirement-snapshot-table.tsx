import type { RetirementTrajectoryPoint } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  formatAmount,
} from "@wealthfolio/ui";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useState } from "react";

const PAGE_SIZE = 10;

export function RetirementSnapshotTable({
  snapshots,
  hasPensionFunds,
  incomeStartAges,
  fiAge,
  phaseLabel,
  currency,
  scaleForModeAtAge,
}: {
  snapshots: RetirementTrajectoryPoint[];
  hasPensionFunds: boolean;
  incomeStartAges: Set<number>;
  fiAge: number | null;
  phaseLabel: string;
  currency: string;
  scaleForModeAtAge: (value: number, age: number) => number;
}) {
  const [tablePage, setTablePage] = useState(0);
  const totalPages = Math.ceil(snapshots.length / PAGE_SIZE);
  const pagedSnapshots = snapshots.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE);

  if (snapshots.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between pb-3">
        <div>
          <div className="text-muted-foreground mb-0.5 text-[10px] font-semibold uppercase tracking-wider">
            Table
          </div>
          <CardTitle className="text-sm">Year-by-Year Snapshot</CardTitle>
          {hasPensionFunds && (
            <p className="text-muted-foreground mt-1 text-xs">
              Pension fund balances are shown until payout starts. After that, the stream appears as
              retirement income.
            </p>
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground text-xs">
              {tablePage + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setTablePage((p) => Math.max(0, p - 1))}
              disabled={tablePage === 0}
            >
              <Icons.ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setTablePage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={tablePage >= totalPages - 1}
            >
              <Icons.ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b">
              <th className="pb-2 text-left">Age</th>
              <th className="pb-2 text-left">Year</th>
              <th className="pb-2 text-left">Phase</th>
              <th className="pb-2 text-right">End Portfolio</th>
              {hasPensionFunds && <th className="pb-2 text-right">Pension Fund</th>}
              <th className="pb-2 text-right">Contribution/yr</th>
              <th className="pb-2 text-right">Retirement income/yr</th>
              <th className="pb-2 text-right">Planned spending/yr</th>
              <th className="pb-2 text-right">Portfolio withdrawal/yr</th>
            </tr>
          </thead>
          <tbody>
            {pagedSnapshots.map((snap) => {
              const isFire = snap.phase === "fire";
              const isFireRow = snap.age === fiAge;
              const isIncomeRow = incomeStartAges.has(snap.age);
              return (
                <tr
                  key={snap.age}
                  className={`border-b last:border-0 ${
                    isFireRow
                      ? "bg-green-50 font-semibold dark:bg-green-950/20"
                      : isIncomeRow
                        ? "bg-blue-50 dark:bg-blue-950/20"
                        : ""
                  }`}
                >
                  <td className="py-1.5">{snap.age}</td>
                  <td className="py-1.5">{snap.year}</td>
                  <td className="py-1.5">
                    <Badge variant={isFire ? "default" : "secondary"} className="text-xs">
                      {isFire ? phaseLabel : "Acc."}
                    </Badge>
                  </td>
                  <td className="py-1.5 text-right">
                    {formatAmount(scaleForModeAtAge(snap.portfolioEnd, snap.age), currency)}
                  </td>
                  {hasPensionFunds && (
                    <td className="py-1.5 text-right">
                      {snap.pensionAssets > 0
                        ? formatAmount(scaleForModeAtAge(snap.pensionAssets, snap.age), currency)
                        : "—"}
                    </td>
                  )}
                  <td className="py-1.5 text-right">
                    {snap.annualContribution > 0
                      ? formatAmount(scaleForModeAtAge(snap.annualContribution, snap.age), currency)
                      : "—"}
                  </td>
                  <td className="py-1.5 text-right">
                    {snap.annualIncome > 0
                      ? formatAmount(scaleForModeAtAge(snap.annualIncome, snap.age), currency)
                      : "—"}
                  </td>
                  <td className="py-1.5 text-right">
                    {(snap.plannedExpenses ?? snap.annualExpenses) > 0
                      ? formatAmount(
                          scaleForModeAtAge(snap.plannedExpenses ?? snap.annualExpenses, snap.age),
                          currency,
                        )
                      : "—"}
                  </td>
                  <td className="py-1.5 text-right">
                    {snap.netWithdrawalFromPortfolio > 0
                      ? formatAmount(
                          scaleForModeAtAge(snap.netWithdrawalFromPortfolio, snap.age),
                          currency,
                        )
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
