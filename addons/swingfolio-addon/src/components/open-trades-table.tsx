import {
  GainAmount,
  GainPercent,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Icons,
  EmptyPlaceholder,
} from "@wealthfolio/ui";
import { TickerAvatar } from "./ticker-avatar";
import type { OpenPosition } from "../types";

interface OpenTradesTableProps {
  positions: OpenPosition[];
}

export function OpenTradesTable({ positions }: OpenTradesTableProps) {
  if (positions.length === 0) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center">
        <EmptyPlaceholder
          className="mx-auto flex max-w-[400px] items-center justify-center"
          icon={<Icons.TrendingUp className="h-10 w-10" />}
          title="No Open Positions"
          description="You don't have any open swing trading positions at the moment. Closed trades will appear in your performance metrics."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]"></TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Avg Cost</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">P/L</TableHead>
              <TableHead className="text-right">Return %</TableHead>
              <TableHead className="text-center">Days</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => (
              <TableRow key={position.id}>
                <TableCell>
                  <TickerAvatar symbol={position.symbol} className="h-8 w-8" />
                </TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium">{position.symbol}</div>
                    {position.assetName && (
                      <div
                        className="text-muted-foreground max-w-[120px] truncate text-xs"
                        title={position.assetName}
                      >
                        {position.assetName}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">{position.quantity.toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  {position.averageCost.toLocaleString("en-US", {
                    style: "currency",
                    currency: position.currency,
                  })}
                </TableCell>
                <TableCell className="text-right">
                  {position.currentPrice.toLocaleString("en-US", {
                    style: "currency",
                    currency: position.currency,
                  })}
                </TableCell>
                <TableCell className="text-right">
                  <GainAmount value={position.unrealizedPL} currency={position.currency} />
                </TableCell>
                <TableCell className="text-right">
                  <GainPercent value={position.unrealizedReturnPercent} />
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className="text-xs">
                    {position.daysOpen}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
