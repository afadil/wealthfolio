import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@wealthfolio/ui/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wealthfolio/ui/components/ui/table";

import { useImportContext } from "../context";
import { HoldingsFormat } from "./holdings-mapping-step";
import type { HoldingsSnapshotInput, HoldingsPositionInput } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const CASH_SYMBOL = "$CASH";

/**
 * Parse CSV rows into holdings snapshots grouped by date
 */
export function parseHoldingsSnapshots(
  headers: string[],
  rows: string[][],
  mapping: Record<string, string>,
  defaultCurrency: string,
): HoldingsSnapshotInput[] {
  const dateHeader = mapping[HoldingsFormat.DATE];
  const symbolHeader = mapping[HoldingsFormat.SYMBOL];
  const quantityHeader = mapping[HoldingsFormat.QUANTITY];
  const priceHeader = mapping[HoldingsFormat.PRICE];
  const currencyHeader = mapping[HoldingsFormat.CURRENCY];

  const dateIndex = dateHeader ? headers.indexOf(dateHeader) : -1;
  const symbolIndex = symbolHeader ? headers.indexOf(symbolHeader) : -1;
  const quantityIndex = quantityHeader ? headers.indexOf(quantityHeader) : -1;
  const priceIndex = priceHeader ? headers.indexOf(priceHeader) : -1;
  const currencyIndex = currencyHeader ? headers.indexOf(currencyHeader) : -1;

  // Group rows by date
  const snapshotsByDate = new Map<
    string,
    { positions: HoldingsPositionInput[]; cashBalances: Record<string, string> }
  >();

  for (const row of rows) {
    const date = dateIndex >= 0 ? row[dateIndex]?.trim() : "";
    const symbol = symbolIndex >= 0 ? row[symbolIndex]?.trim().toUpperCase() : "";
    const quantity = quantityIndex >= 0 ? row[quantityIndex]?.trim() : "";
    const price = priceIndex >= 0 ? row[priceIndex]?.trim() : undefined;
    const currency = currencyIndex >= 0 ? row[currencyIndex]?.trim() : defaultCurrency;

    if (!date || !symbol || !quantity) {
      continue; // Skip rows with missing required fields
    }

    // Normalize date format to YYYY-MM-DD
    const normalizedDate = normalizeDate(date);
    if (!normalizedDate) {
      continue; // Skip invalid dates
    }

    if (!snapshotsByDate.has(normalizedDate)) {
      snapshotsByDate.set(normalizedDate, { positions: [], cashBalances: {} });
    }

    const snapshot = snapshotsByDate.get(normalizedDate)!;

    if (symbol === CASH_SYMBOL) {
      // Cash balance entry
      const cashCurrency = currency || defaultCurrency;
      const existingAmount = parseFloat(snapshot.cashBalances[cashCurrency] || "0");
      const newAmount = parseFloat(quantity) || 0;
      snapshot.cashBalances[cashCurrency] = String(existingAmount + newAmount);
    } else {
      // Security position
      snapshot.positions.push({
        symbol,
        quantity,
        price: price || undefined,
        currency: currency || defaultCurrency,
      });
    }
  }

  // Convert map to array sorted by date
  const snapshots: HoldingsSnapshotInput[] = [];
  for (const [date, data] of snapshotsByDate.entries()) {
    snapshots.push({
      date,
      positions: data.positions,
      cashBalances: data.cashBalances,
    });
  }

  // Sort by date (newest first)
  snapshots.sort((a, b) => b.date.localeCompare(a.date));

  return snapshots;
}

/**
 * Normalize various date formats to YYYY-MM-DD
 */
function normalizeDate(dateStr: string): string | null {
  // Try parsing common formats
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
    /^(\d{2})\/(\d{2})\/(\d{4})$/, // MM/DD/YYYY or DD/MM/YYYY
    /^(\d{2})-(\d{2})-(\d{4})$/, // MM-DD-YYYY or DD-MM-YYYY
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      if (format === formats[0]) {
        // Already YYYY-MM-DD
        return dateStr;
      }
      // For other formats, assume MM/DD/YYYY (US format)
      // This is a simplification; a more robust solution would detect the format
      const [, part1, part2, year] = match;
      // Assuming MM/DD/YYYY or DD/MM/YYYY - use heuristics
      const month = parseInt(part1) > 12 ? part2 : part1;
      const day = parseInt(part1) > 12 ? part1 : part2;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  // Try parsing as JavaScript Date
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split("T")[0];
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Holdings Review Step Component
// ─────────────────────────────────────────────────────────────────────────────

export function HoldingsReviewStep() {
  const { state } = useImportContext();
  const { headers, parsedRows, mapping, parseConfig } = state;

  // Parse snapshots from CSV data
  const snapshots = useMemo(() => {
    const fieldMappings = mapping?.fieldMappings || {};
    return parseHoldingsSnapshots(headers, parsedRows, fieldMappings, parseConfig.defaultCurrency);
  }, [headers, parsedRows, mapping?.fieldMappings, parseConfig.defaultCurrency]);

  // Calculate totals
  const totalPositions = snapshots.reduce((sum, s) => sum + s.positions.length, 0);
  const totalCashEntries = snapshots.reduce(
    (sum, s) => sum + Object.keys(s.cashBalances).length,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Summary Card */}
      <Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-sm font-medium">Review Holdings Import</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <div className="text-primary text-2xl font-bold">{snapshots.length}</div>
              <div className="text-muted-foreground text-xs">Snapshots</div>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold">{totalPositions}</div>
              <div className="text-muted-foreground text-xs">Positions</div>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold">{totalCashEntries}</div>
              <div className="text-muted-foreground text-xs">Cash Balances</div>
            </div>
            <div className="bg-primary/10 rounded-lg p-3 text-center">
              <div className="text-primary text-2xl font-bold">
                <Icons.Check className="mx-auto h-8 w-8" />
              </div>
              <div className="text-muted-foreground text-xs">Ready to Import</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Snapshots Accordion */}
      <Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-sm font-medium">Snapshots by Date</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Accordion type="single" collapsible className="w-full">
            {snapshots.map((snapshot) => (
              <AccordionItem key={snapshot.date} value={snapshot.date}>
                <AccordionTrigger className="px-4 hover:no-underline">
                  <div className="flex w-full items-center justify-between pr-4">
                    <div className="flex items-center gap-3">
                      <Icons.Calendar className="text-muted-foreground h-4 w-4" />
                      <span className="font-medium">{snapshot.date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {snapshot.positions.length} position
                        {snapshot.positions.length !== 1 ? "s" : ""}
                      </Badge>
                      {Object.keys(snapshot.cashBalances).length > 0 && (
                        <Badge variant="outline">
                          {Object.keys(snapshot.cashBalances).length} cash
                        </Badge>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 px-4 pb-4">
                    {/* Positions Table */}
                    {snapshot.positions.length > 0 && (
                      <div>
                        <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                          <Icons.TrendingUp className="h-4 w-4" />
                          Positions
                        </h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Symbol</TableHead>
                              <TableHead className="text-right">Quantity</TableHead>
                              <TableHead className="text-right">Price</TableHead>
                              <TableHead>Currency</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {snapshot.positions.map((position, posIndex) => (
                              <TableRow key={posIndex}>
                                <TableCell className="font-medium">{position.symbol}</TableCell>
                                <TableCell className="text-right font-mono">
                                  {position.quantity}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {position.price || "-"}
                                </TableCell>
                                <TableCell>{position.currency}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {/* Cash Balances */}
                    {Object.keys(snapshot.cashBalances).length > 0 && (
                      <div>
                        <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                          <Icons.DollarSign className="h-4 w-4" />
                          Cash Balances
                        </h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Currency</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Object.entries(snapshot.cashBalances).map(([currency, amount]) => (
                              <TableRow key={currency}>
                                <TableCell className="font-medium">{currency}</TableCell>
                                <TableCell className="text-right font-mono">{amount}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}

export default HoldingsReviewStep;
