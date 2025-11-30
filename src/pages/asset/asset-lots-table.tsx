import { DataTable, formatAmount, GainAmount, GainPercent } from "@wealthvn/ui";
import { DataTableColumnHeader } from "@/components/ui/data-table/data-table-column-header";
import type { ColumnDef } from "@tanstack/react-table";
import { Lot } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";

interface AssetLotsTableProps {
  lots: Lot[];
  currency: string;
  marketPrice: number;
}

interface LotWithCalculations extends Lot {
  marketValue: number;
  gainLossAmount: number;
  gainLossPercent: number;
  holdingDays: number;
}

const calculateHoldingDays = (acquisitionDate: string): number => {
  const acquired = new Date(acquisitionDate);
  const today = new Date();
  const diffTime = Math.abs(today.getTime() - acquired.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

export const AssetLotsTable = ({ lots, currency, marketPrice }: AssetLotsTableProps) => {
  const { t } = useTranslation(["assets"]);

  const lotsWithCalculations: LotWithCalculations[] = useMemo(() => {
    if (!lots || lots.length === 0) return [];

    return [...lots]
      .sort((a, b) => new Date(a.acquisitionDate).getTime() - new Date(b.acquisitionDate).getTime())
      .map((lot) => {
        const marketValue = lot.quantity * marketPrice;
        const gainLossAmount = marketValue - lot.costBasis;
        const gainLossPercent = lot.costBasis !== 0 ? gainLossAmount / lot.costBasis : 0;
        const holdingDays = calculateHoldingDays(lot.acquisitionDate);

        return {
          ...lot,
          marketValue,
          gainLossAmount,
          gainLossPercent,
          holdingDays,
        };
      });
  }, [lots, marketPrice]);

  const columns: ColumnDef<LotWithCalculations>[] = useMemo(
    () => [
      {
        id: "acquisitionDate",
        accessorKey: "acquisitionDate",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("assets:lotsTable.acquiredDate")} />
        ),
        meta: {
          label: t("assets:lotsTable.acquiredDate"),
        },
        cell: ({ row }) => (
          <div className="font-medium">{formatDate(row.original.acquisitionDate)}</div>
        ),
        enableHiding: false,
      },
      {
        id: "holdingDays",
        accessorKey: "holdingDays",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("assets:lotsTable.holdingDays")}
            className="justify-center text-center"
          />
        ),
        meta: {
          label: t("assets:lotsTable.holdingDays"),
        },
        cell: ({ row }) => (
          <div className="text-center">{row.original.holdingDays.toLocaleString()}</div>
        ),
        enableHiding: true,
      },
      {
        id: "quantity",
        accessorKey: "quantity",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("assets:lotsTable.quantity")}
            className="justify-center text-center"
          />
        ),
        meta: {
          label: t("assets:lotsTable.quantity"),
        },
        cell: ({ row }) => (
          <div className="text-center">{row.original.quantity.toFixed(2)}</div>
        ),
        enableHiding: true,
      },
      {
        id: "acquisitionPrice",
        accessorKey: "acquisitionPrice",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("assets:lotsTable.acquisitionPrice")}
            className="justify-center text-center"
          />
        ),
        meta: {
          label: t("assets:lotsTable.acquisitionPrice"),
        },
        cell: ({ row }) => (
          <div className="text-center">{formatAmount(row.original.acquisitionPrice, currency)}</div>
        ),
        enableHiding: true,
      },
      {
        id: "fees",
        accessorKey: "acquisitionFees",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("assets:lotsTable.fees")}
            className="justify-center text-center"
          />
        ),
        meta: {
          label: t("assets:lotsTable.fees"),
        },
        cell: ({ row }) => (
          <div className="text-center">{formatAmount(row.original.acquisitionFees, currency)}</div>
        ),
        enableHiding: true,
      },
      {
        id: "costBasis",
        accessorKey: "costBasis",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("assets:lotsTable.costBasis")}
            className="justify-center text-center"
          />
        ),
        meta: {
          label: t("assets:lotsTable.costBasis"),
        },
        cell: ({ row }) => (
          <div className="text-center">{formatAmount(row.original.costBasis, currency)}</div>
        ),
        enableHiding: true,
      },
      {
        id: "marketValue",
        accessorKey: "marketValue",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("assets:lotsTable.marketValue")}
            className="justify-center text-center"
          />
        ),
        meta: {
          label: t("assets:lotsTable.marketValue"),
        },
        cell: ({ row }) => (
          <div className="text-center">{formatAmount(row.original.marketValue, currency)}</div>
        ),
        enableHiding: true,
      },
      {
        id: "gainLoss",
        accessorKey: "gainLossAmount",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("assets:lotsTable.gainLoss")}
            className="justify-end text-right"
          />
        ),
        meta: {
          label: t("assets:lotsTable.gainLoss"),
        },
        cell: ({ row }) => (
          <div className="flex flex-row items-center justify-end space-x-2">
            <GainAmount
              value={row.original.gainLossAmount}
              currency={currency}
              displayCurrency={false}
            />
            <GainPercent value={row.original.gainLossPercent} variant="badge" />
          </div>
        ),
        enableHiding: false,
      },
    ],
    [currency, t],
  );

  if (!lots || lots.length === 0) {
    return null;
  }

  return (
    <Card className="mt-4">
      <CardContent className="p-4">
        <DataTable
          data={lotsWithCalculations}
          columns={columns}
          showColumnToggle={true}
          defaultColumnVisibility={{
            fees: false,
          }}
          defaultSorting={[{ id: "acquisitionDate", desc: false }]}
          scrollable={true}
        />
      </CardContent>
    </Card>
  );
};

export default AssetLotsTable;
