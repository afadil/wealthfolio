import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wealthfolio/ui/components/ui/table";
import { Lot } from "@/lib/types";
import { formatAmount } from "@wealthfolio/ui";
import { formatDate, formatQuantity } from "@/lib/utils";
import { Card, CardContent } from "@wealthfolio/ui/components/ui/card";
import { GainAmount } from "@wealthfolio/ui";
import { GainPercent } from "@wealthfolio/ui";
import { format, isValid, parseISO } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";

function formatAcquisitionDateDisplay(dateStr: string, language: string | undefined): string {
  const parsed = parseISO(dateStr);
  if (!isValid(parsed)) {
    return formatDate(dateStr);
  }
  const locale = language?.startsWith("de") ? de : enUS;
  return format(parsed, "PP", { locale });
}

interface AssetLotsTableProps {
  lots: Lot[];
  currency: string;
  marketPrice: number;
}

export const AssetLotsTable = ({ lots, currency, marketPrice }: AssetLotsTableProps) => {
  const { t, i18n } = useTranslation("common");

  if (!lots || lots.length === 0) {
    return null;
  }

  const sortedLots = [...lots].sort(
    (a, b) => new Date(a.acquisitionDate).getTime() - new Date(b.acquisitionDate).getTime(),
  );

  return (
    <Card className="mt-4">
      <CardContent className="p-0">
        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead className="w-[160px]">{t("asset.lots.col_acquired_date")}</TableHead>
                <TableHead className="text-right">{t("asset.lots.col_quantity")}</TableHead>
                <TableHead className="text-right">{t("asset.lots.col_acquisition_price")}</TableHead>
                <TableHead className="text-right">{t("asset.lots.col_fees")}</TableHead>
                <TableHead className="text-right">{t("asset.lots.col_cost_basis")}</TableHead>
                <TableHead className="text-right">{t("asset.lots.col_market_value")}</TableHead>
                <TableHead className="text-right">{t("asset.lots.col_gain_loss")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedLots.map((lot) => {
                const marketValue = lot.quantity * marketPrice;
                const gainLossAmount = marketValue - lot.costBasis;
                const gainLossPercent = lot.costBasis !== 0 ? gainLossAmount / lot.costBasis : 0;

                return (
                  <TableRow key={lot.id}>
                    <TableCell className="font-medium">
                      {formatAcquisitionDateDisplay(lot.acquisitionDate, i18n.language)}
                    </TableCell>
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

        {/* Mobile card list */}
        <div className="divide-y md:hidden">
          {sortedLots.map((lot) => {
            const marketValue = lot.quantity * marketPrice;
            const gainLossAmount = marketValue - lot.costBasis;
            const gainLossPercent = lot.costBasis !== 0 ? gainLossAmount / lot.costBasis : 0;

            return (
              <div key={lot.id} className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {formatAcquisitionDateDisplay(lot.acquisitionDate, i18n.language)}
                  </span>
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
                  <span>{t("asset.lots.col_quantity")}</span>
                  <span className="text-foreground text-right">{formatQuantity(lot.quantity)}</span>
                  <span>{t("asset.lots.mobile_acq_price_short")}</span>
                  <span className="text-foreground text-right">
                    {formatAmount(lot.acquisitionPrice, currency)}
                  </span>
                  <span>{t("asset.lots.col_fees")}</span>
                  <span className="text-foreground text-right">
                    {formatAmount(lot.acquisitionFees, currency)}
                  </span>
                  <span>{t("asset.lots.col_cost_basis")}</span>
                  <span className="text-foreground text-right">
                    {formatAmount(lot.costBasis, currency)}
                  </span>
                  <span>{t("asset.lots.col_market_value")}</span>
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
};

export default AssetLotsTable;
