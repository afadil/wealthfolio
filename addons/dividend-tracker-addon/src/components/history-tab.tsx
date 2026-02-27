import { useQuery } from "@tanstack/react-query";
import type { AddonContext } from "@wealthfolio/addon-sdk";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wealthfolio/ui";
import { format } from "date-fns";

interface HistoryTabProps {
  ctx: AddonContext;
}

export default function HistoryTab({ ctx }: HistoryTabProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["activities", "DIVIDEND", "history"],
    queryFn: async () => {
      const res = await ctx.api.activities.search(
        0,
        200,
        { activityTypes: ["DIVIDEND"] },
        "",
        { id: "date", desc: true },
      );
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="text-muted-foreground py-12 text-center text-sm">Loading...</div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-muted-foreground py-12 text-center text-sm">
        No dividend activities found.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Symbol</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead>Subtype</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((a) => (
            <TableRow key={a.id}>
              <TableCell>{format(new Date(a.date), "MMM d, yyyy")}</TableCell>
              <TableCell className="font-mono">{a.assetSymbol}</TableCell>
              <TableCell>{a.accountName}</TableCell>
              <TableCell>{a.amount}</TableCell>
              <TableCell>{a.currency}</TableCell>
              <TableCell>{a.subtype ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
