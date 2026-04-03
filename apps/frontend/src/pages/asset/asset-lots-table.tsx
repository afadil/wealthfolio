import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wealthfolio/ui/components/ui/table";
import { Lot, LotView } from "@/lib/types";
import { formatAmount } from "@wealthfolio/ui";
import { formatDate, formatQuantity } from "@/lib/utils";
import { Card, CardContent } from "@wealthfolio/ui/components/ui/card";
import { GainAmount } from "@wealthfolio/ui";
import { GainPercent } from "@wealthfolio/ui";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useAccounts } from "@/hooks/use-accounts";

interface AssetLotsTableProps {
  lots: Lot[];
  lotDetails?: LotView[] | null;
  currency: string;
  marketPrice: number;
}

export const AssetLotsTable = ({ lots, lotDetails, currency, marketPrice }: AssetLotsTableProps) => {
  // Use lotDetails (rich view with open/closed + account) when available
  if (lotDetails && lotDetails.length > 0) {
    return (
      <LotDetailsView lotDetails={lotDetails} currency={currency} marketPrice={marketPrice} />
    );
  }

  // Fallback to legacy lots display
  if (!lots || lots.length === 0) {
    return null;
  }

  return <LegacyLotsView lots={lots} currency={currency} marketPrice={marketPrice} />;
};

// ─── Rich lot details view with account grouping and open/closed status ───

function LotDetailsView({
  lotDetails,
  currency,
  marketPrice,
}: {
  lotDetails: LotView[];
  currency: string;
  marketPrice: number;
}) {
  const { accounts } = useAccounts();
  const accountMap = new Map(accounts?.map((a) => [a.id, a.name]) ?? []);

  // Group by account
  const byAccount = new Map<string, LotView[]>();
  for (const lot of lotDetails) {
    const list = byAccount.get(lot.accountId) ?? [];
    list.push(lot);
    byAccount.set(lot.accountId, list);
  }

  const multiAccount = byAccount.size > 1;

  // Sort each group: open lots first (by date), then closed lots (by close date)
  for (const [, groupLots] of byAccount) {
    groupLots.sort((a, b) => {
      if (a.isClosed !== b.isClosed) return a.isClosed ? 1 : -1;
      return new Date(a.acquisitionDate).getTime() - new Date(b.acquisitionDate).getTime();
    });
  }

  return (
    <Card className="mt-4">
      <CardContent className="p-0">
        {Array.from(byAccount.entries()).map(([accountId, groupLots]) => (
          <AccountLotGroup
            key={accountId}
            accountName={accountMap.get(accountId) ?? accountId}
            lots={groupLots}
            currency={currency}
            marketPrice={marketPrice}
            collapsible={multiAccount}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function AccountLotGroup({
  accountName,
  lots,
  currency,
  marketPrice,
  collapsible,
}: {
  accountName: string;
  lots: LotView[];
  currency: string;
  marketPrice: number;
  collapsible: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const openCount = lots.filter((l) => !l.isClosed).length;
  const closedCount = lots.filter((l) => l.isClosed).length;

  return (
    <div>
      {collapsible && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="hover:bg-muted flex w-full items-center gap-2 px-4 py-2 text-sm font-medium"
        >
          {expanded ? (
            <Icons.ChevronDown className="h-4 w-4" />
          ) : (
            <Icons.ChevronRight className="h-4 w-4" />
          )}
          {accountName}
          <span className="text-muted-foreground ml-auto text-xs">
            {openCount} open{closedCount > 0 ? `, ${closedCount} closed` : ""}
          </span>
        </button>
      )}
      {(!collapsible || expanded) && (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead className="whitespace-nowrap">Acquired</TableHead>
                  <TableHead className="text-right">Original Qty</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="text-right">Cost/Unit</TableHead>
                  <TableHead className="text-right">Fees</TableHead>
                  <TableHead className="text-right">Cost Basis</TableHead>
                  <TableHead className="text-right">Market Value</TableHead>
                  <TableHead className="text-right">Gain/Loss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots.map((lot) => {
                  const marketValue = lot.remainingQuantity * marketPrice;
                  const gainLoss = marketValue - lot.totalCostBasis;
                  const gainPct = lot.totalCostBasis !== 0 ? gainLoss / lot.totalCostBasis : 0;

                  return (
                    <TableRow key={lot.id} className={lot.isClosed ? "opacity-50" : ""}>
                      <TableCell>
                        <Badge variant={lot.isClosed ? "secondary" : "outline"} className="text-xs">
                          {lot.isClosed ? "Closed" : "Open"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatDate(lot.acquisitionDate)}
                        {lot.isClosed && lot.closeDate && (
                          <div className="text-muted-foreground text-xs">
                            Closed {formatDate(lot.closeDate)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatQuantity(lot.originalQuantity)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatQuantity(lot.remainingQuantity)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatAmount(lot.costPerUnit, currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatAmount(lot.fees, currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatAmount(lot.totalCostBasis, currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {lot.isClosed ? "—" : formatAmount(marketValue, currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {lot.isClosed ? (
                          "—"
                        ) : (
                          <div className="flex flex-row items-center justify-end space-x-2">
                            <GainAmount
                              value={gainLoss}
                              currency={currency}
                              displayCurrency={false}
                            />
                            <GainPercent value={gainPct} variant="badge" />
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card list */}
          <div className="divide-y md:hidden">
            {lots.map((lot) => {
              const marketValue = lot.remainingQuantity * marketPrice;
              const gainLoss = marketValue - lot.totalCostBasis;
              const gainPct = lot.totalCostBasis !== 0 ? gainLoss / lot.totalCostBasis : 0;

              return (
                <div key={lot.id} className={`space-y-2 p-4 ${lot.isClosed ? "opacity-50" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={lot.isClosed ? "secondary" : "outline"}
                        className="text-xs"
                      >
                        {lot.isClosed ? "Closed" : "Open"}
                      </Badge>
                      <span className="text-sm font-medium">
                        {formatDate(lot.acquisitionDate)}
                      </span>
                    </div>
                    {!lot.isClosed && (
                      <div className="flex items-center space-x-2">
                        <GainAmount
                          value={gainLoss}
                          currency={currency}
                          displayCurrency={false}
                        />
                        <GainPercent value={gainPct} variant="badge" />
                      </div>
                    )}
                  </div>
                  <div className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <span>Remaining</span>
                    <span className="text-foreground text-right">
                      {formatQuantity(lot.remainingQuantity)} / {formatQuantity(lot.originalQuantity)}
                    </span>
                    <span>Cost/Unit</span>
                    <span className="text-foreground text-right">
                      {formatAmount(lot.costPerUnit, currency)}
                    </span>
                    <span>Cost Basis</span>
                    <span className="text-foreground text-right">
                      {formatAmount(lot.totalCostBasis, currency)}
                    </span>
                    {!lot.isClosed && (
                      <>
                        <span>Market Value</span>
                        <span className="text-foreground text-right">
                          {formatAmount(marketValue, currency)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Legacy view (original lots without account/status info) ───

function LegacyLotsView({
  lots,
  currency,
  marketPrice,
}: {
  lots: Lot[];
  currency: string;
  marketPrice: number;
}) {
  const sortedLots = [...lots].sort(
    (a, b) => new Date(a.acquisitionDate).getTime() - new Date(b.acquisitionDate).getTime(),
  );

  return (
    <Card className="mt-4">
      <CardContent className="p-0">
        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead className="w-[160px]">Acquired Date</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Acquisition Price</TableHead>
                <TableHead className="text-right">Fees</TableHead>
                <TableHead className="text-right">Cost Basis</TableHead>
                <TableHead className="text-right">Market Value</TableHead>
                <TableHead className="text-right">Gain/Loss</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedLots.map((lot) => {
                const marketValue = lot.quantity * marketPrice;
                const gainLossAmount = marketValue - lot.costBasis;
                const gainLossPercent = lot.costBasis !== 0 ? gainLossAmount / lot.costBasis : 0;

                return (
                  <TableRow key={lot.id}>
                    <TableCell className="font-medium">{formatDate(lot.acquisitionDate)}</TableCell>
                    <TableCell className="text-right">{formatQuantity(lot.quantity)}</TableCell>
                    <TableCell className="text-right">
                      {formatAmount(lot.acquisitionPrice, currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatAmount(lot.acquisitionFees, currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatAmount(lot.costBasis, currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatAmount(marketValue, currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-row items-center justify-end space-x-2">
                        <GainAmount
                          value={gainLossAmount}
                          currency={currency}
                          displayCurrency={false}
                        />
                        <GainPercent value={gainLossPercent} variant="badge" />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="divide-y md:hidden">
          {sortedLots.map((lot) => {
            const marketValue = lot.quantity * marketPrice;
            const gainLossAmount = marketValue - lot.costBasis;
            const gainLossPercent = lot.costBasis !== 0 ? gainLossAmount / lot.costBasis : 0;

            return (
              <div key={lot.id} className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{formatDate(lot.acquisitionDate)}</span>
                  <div className="flex items-center space-x-2">
                    <GainAmount
                      value={gainLossAmount}
                      currency={currency}
                      displayCurrency={false}
                    />
                    <GainPercent value={gainLossPercent} variant="badge" />
                  </div>
                </div>
                <div className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span>Quantity</span>
                  <span className="text-foreground text-right">{formatQuantity(lot.quantity)}</span>
                  <span>Acq. Price</span>
                  <span className="text-foreground text-right">
                    {formatAmount(lot.acquisitionPrice, currency)}
                  </span>
                  <span>Fees</span>
                  <span className="text-foreground text-right">
                    {formatAmount(lot.acquisitionFees, currency)}
                  </span>
                  <span>Cost Basis</span>
                  <span className="text-foreground text-right">
                    {formatAmount(lot.costBasis, currency)}
                  </span>
                  <span>Market Value</span>
                  <span className="text-foreground text-right">
                    {formatAmount(marketValue, currency)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default AssetLotsTable;
