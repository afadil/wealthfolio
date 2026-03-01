import { useQuery } from "@tanstack/react-query";
import { QueryKeys, type AddonContext } from "@wealthfolio/addon-sdk";
import {
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  formatAmount,
  useBalancePrivacy,
} from "@wealthfolio/ui";
import { format } from "date-fns";
import { useMemo, useState } from "react";

interface HistoryTabProps {
  ctx: AddonContext;
}

const PAGE_SIZE = 200;

type SortKey = "date" | "assetSymbol" | "accountName" | "amount";
type SortDir = "asc" | "desc";

function SortIcon({ col, sort }: { col: SortKey; sort: { key: SortKey; dir: SortDir } }) {
  if (sort.key !== col) return <span className="ml-1 opacity-30">↕</span>;
  return <span className="ml-1">{sort.dir === "asc" ? "↑" : "↓"}</span>;
}

export default function HistoryTab({ ctx }: HistoryTabProps) {
  const { isBalanceHidden } = useBalancePrivacy();
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "date", dir: "desc" });
  const [accountFilter, setAccountFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: [QueryKeys.ACTIVITIES, "DIVIDEND", "history"],
    queryFn: async () => {
      const res = await ctx.api.activities.search(
        0,
        PAGE_SIZE,
        { activityTypes: ["DIVIDEND"] },
        "",
        { id: "date", desc: true },
      );
      return { data: res.data, totalRowCount: res.meta.totalRowCount };
    },
    staleTime: 5 * 60 * 1000,
  });

  const uniqueAccounts = useMemo(() => {
    if (!data?.data) return [];
    return Array.from(new Set(data.data.map((a) => a.accountName))).sort();
  }, [data]);

  const filteredSorted = useMemo(() => {
    if (!data?.data) return [];
    let rows = data.data;
    if (accountFilter !== "all") {
      rows = rows.filter((a) => a.accountName === accountFilter);
    }
    return [...rows].sort((a, b) => {
      let cmp = 0;
      if (sort.key === "date") {
        cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sort.key === "amount") {
        cmp = Number(a.amount ?? 0) - Number(b.amount ?? 0);
      } else {
        const av = sort.key === "assetSymbol" ? a.assetSymbol : a.accountName;
        const bv = sort.key === "assetSymbol" ? b.assetSymbol : b.accountName;
        cmp = av.localeCompare(bv);
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [data, accountFilter, sort]);

  const currencyTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const a of filteredSorted) {
      totals.set(a.currency, (totals.get(a.currency) ?? 0) + Number(a.amount ?? 0));
    }
    return totals;
  }, [filteredSorted]);

  function toggleSort(key: SortKey) {
    setSort((prev) => ({
      key,
      dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc",
    }));
  }

  if (isLoading) {
    return <div className="text-muted-foreground py-12 text-center text-sm">Loading...</div>;
  }

  if (!data || data.data.length === 0) {
    return (
      <div className="text-muted-foreground py-12 text-center text-sm">
        No dividend activities found.
      </div>
    );
  }

  if (filteredSorted.length === 0) {
    return (
      <div className="text-muted-foreground py-12 text-center text-sm">
        No dividends found for this account.
      </div>
    );
  }

  const isTruncated = data.totalRowCount > PAGE_SIZE;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="h-8 w-[200px]">
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {uniqueAccounts.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isTruncated && (
        <p className="text-muted-foreground px-1 text-xs">
          Showing {PAGE_SIZE} of {data.totalRowCount} dividend activities.
        </p>
      )}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button
                  onClick={() => toggleSort("date")}
                  className="flex items-center font-medium"
                >
                  Date <SortIcon col="date" sort={sort} />
                </button>
              </TableHead>
              <TableHead>
                <button
                  onClick={() => toggleSort("assetSymbol")}
                  className="flex items-center font-medium"
                >
                  Symbol <SortIcon col="assetSymbol" sort={sort} />
                </button>
              </TableHead>
              <TableHead>
                <button
                  onClick={() => toggleSort("accountName")}
                  className="flex items-center font-medium"
                >
                  Account <SortIcon col="accountName" sort={sort} />
                </button>
              </TableHead>
              <TableHead>
                <button
                  onClick={() => toggleSort("amount")}
                  className="flex items-center font-medium"
                >
                  Amount <SortIcon col="amount" sort={sort} />
                </button>
              </TableHead>
              <TableHead>Subtype</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSorted.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{format(new Date(a.date), "MMM d, yyyy")}</TableCell>
                <TableCell className="font-mono">{a.assetSymbol}</TableCell>
                <TableCell>{a.accountName}</TableCell>
                <TableCell>
                  {isBalanceHidden ? "••••" : formatAmount(Number(a.amount ?? 0), a.currency)}
                </TableCell>
                <TableCell>
                  {a.subtype ? <Badge variant="secondary">{a.subtype}</Badge> : "—"}
                </TableCell>
              </TableRow>
            ))}
            {Array.from(currencyTotals.entries()).map(([currency, total]) => (
              <TableRow key={`total-${currency}`} className="bg-muted/50 font-medium">
                <TableCell colSpan={3} className="text-muted-foreground text-right text-xs">
                  {currency} total
                </TableCell>
                <TableCell>{isBalanceHidden ? "••••" : formatAmount(total, currency)}</TableCell>
                <TableCell />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
