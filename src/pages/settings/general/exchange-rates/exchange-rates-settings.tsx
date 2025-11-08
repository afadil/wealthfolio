import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useExchangeRates } from "./use-exchange-rate";
import { DataTable } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { ExchangeRate } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { RateCell } from "./rate-cell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { AddExchangeRateForm } from "./add-exchange-rate-form";
import { Icons } from "@/components/ui/icons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/utils";

export function ExchangeRatesSettings() {
  const { t } = useTranslation("settings");
  const { exchangeRates, isLoadingRates, updateExchangeRate, addExchangeRate, deleteExchangeRate } =
    useExchangeRates();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const columns: ColumnDef<ExchangeRate>[] = [
    {
      accessorKey: "fromCurrency",
      header: t("exchange_rates_from"),
      enableHiding: false,
      cell: ({ row }) => (
        <div>
          <div>{row.original.fromCurrency}</div>
          <div className="text-muted-foreground text-xs">{row.original.fromCurrencyName}</div>
        </div>
      ),
    },
    {
      accessorKey: "toCurrency",
      header: t("exchange_rates_to"),
      enableHiding: false,
      cell: ({ row }) => (
        <div>
          <div>{row.original.toCurrency}</div>
          <div className="text-muted-foreground text-xs">{row.original.toCurrencyName}</div>
        </div>
      ),
    },
    {
      accessorKey: "source",
      header: t("exchange_rates_source"),
      enableHiding: false,
    },
    {
      accessorKey: "rate",
      header: t("exchange_rates_rate"),
      enableHiding: false,
      cell: ({ row }) => <RateCell rate={row.original} onUpdate={updateExchangeRate} />,
      size: 180,
    },
    {
      accessorKey: "updatedAt",
      header: t("exchange_rates_last_updated"),
      enableHiding: false,
      cell: ({ row }) => (
        <div className="text-muted-foreground text-sm">{formatDate(row.original.timestamp)}</div>
      ),
    },
    {
      id: "history",
      enableHiding: false,
      cell: ({ row }) => (
        <Link
          to={`/holdings/${encodeURIComponent(row.original.id)}`}
          className="flex items-center justify-center"
        >
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Icons.Clock className="h-4 w-4" />
            <span className="sr-only">{t("exchange_rates_view_history")}</span>
          </Button>
        </Link>
      ),
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        // Only show delete for Manual source
        if (row.original.source !== "MANUAL") {
          return null;
        }

        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm">
                <Icons.Trash className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <h4 className="leading-none font-medium">{t("exchange_rates_delete_title")}</h4>
                  <p className="text-muted-foreground text-sm">
                    {t("exchange_rates_delete_message")}
                  </p>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteExchangeRate(row.original.id)}
                  >
                    {t("exchange_rates_delete_button")}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        );
      },
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{t("exchange_rates_title")}</CardTitle>
            <CardDescription>
              {t("exchange_rates_description")}
            </CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Icons.PlusCircle className="mr-2 h-4 w-4" />
                {t("exchange_rates_add_button")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <AddExchangeRateForm
                onSubmit={(newRate) => {
                  addExchangeRate(newRate);
                  setIsAddDialogOpen(false);
                }}
                onCancel={() => setIsAddDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoadingRates ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : exchangeRates && exchangeRates.length > 0 ? (
          <DataTable columns={columns} data={exchangeRates} />
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Icons.DollarSign className="text-muted-foreground h-12 w-12" />
            <h3 className="mt-4 text-lg font-semibold">{t("exchange_rates_empty_title")}</h3>

            <Button className="mt-4" onClick={() => setIsAddDialogOpen(true)}>
              <Icons.PlusCircle className="mr-2 h-4 w-4" />
              {t("exchange_rates_add_button")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
