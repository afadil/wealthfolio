import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthfolio/ui/components/ui/card";
import { DataTable, DataTableColumnHeader } from "@wealthfolio/ui/components/ui/data-table";
import { Dialog, DialogContent, DialogTrigger } from "@wealthfolio/ui/components/ui/dialog";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { ExchangeRate } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import { ActionConfirm } from "@wealthfolio/ui";
import { useSettings } from "@/hooks/use-settings";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AddExchangeRateForm } from "./add-exchange-rate-form";
import { RateCell } from "./rate-cell";
import { useExchangeRates } from "./use-exchange-rate";

export function ExchangeRatesSettings() {
  const { t } = useTranslation("common");
  const {
    exchangeRates,
    isLoadingRates,
    updateExchangeRate,
    addExchangeRate,
    deleteExchangeRate,
    isDeletingRate,
  } = useExchangeRates();
  const { data: settings } = useSettings();
  const baseCurrency = (settings?.baseCurrency ?? "USD").toUpperCase();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addFormKey, setAddFormKey] = useState(0);
  const prevAddDialogOpen = useRef(false);
  useEffect(() => {
    if (isAddDialogOpen) {
      if (!prevAddDialogOpen.current) {
        setAddFormKey((k) => k + 1);
      }
      prevAddDialogOpen.current = true;
    } else {
      prevAddDialogOpen.current = false;
    }
  }, [isAddDialogOpen]);

  const sourceDisplayNames = useMemo(
    () =>
      ({
        YAHOO: t("settings.exchange_rates.source_yahoo"),
        ALPHA_VANTAGE: t("settings.exchange_rates.source_alpha"),
        MANUAL: t("settings.exchange_rates.source_manual"),
        CUSTOM_SCRAPER: t("settings.exchange_rates.source_custom"),
        CUSTOMSCRAPER: t("settings.exchange_rates.source_custom"),
      }) as Record<string, string>,
    [t],
  );

  const columns: ColumnDef<ExchangeRate>[] = useMemo(
    () => [
    {
      accessorKey: "fromCurrency",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("settings.exchange_rates.col_from")} />
      ),
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
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("settings.exchange_rates.col_to")} />
      ),
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
      header: t("settings.exchange_rates.col_source"),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const source = row.original.source;
        if (source.startsWith("CUSTOM_SCRAPER:")) {
          const code = source.slice("CUSTOM_SCRAPER:".length);
          return <span className="capitalize">{code}</span>;
        }
        return <span>{sourceDisplayNames[source] ?? source}</span>;
      },
    },
    {
      accessorKey: "rate",
      header: t("settings.exchange_rates.col_rate"),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => <RateCell rate={row.original} onUpdate={updateExchangeRate} />,
      size: 180,
    },
    {
      accessorKey: "updatedAt",
      header: t("settings.exchange_rates.col_last_updated"),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className="text-muted-foreground text-sm">{formatDate(row.original.timestamp)}</div>
      ),
    },
    {
      id: "history",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <Link
          to={`/holdings/${encodeURIComponent(row.original.id)}`}
          className="flex items-center justify-center"
        >
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Icons.Clock className="h-4 w-4" />
            <span className="sr-only">{t("settings.exchange_rates.history_aria")}</span>
          </Button>
        </Link>
      ),
    },
    {
      id: "actions",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const rate = row.original;
        const currencyPair = `${rate.fromCurrency}/${rate.toCurrency}`;

        return (
          <ActionConfirm
            confirmTitle={t("settings.exchange_rates.delete_confirm_title")}
            confirmMessage={
              <>
                <p className="mb-2">
                  {t("settings.exchange_rates.delete_confirm_intro", { pair: currencyPair })}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  <Icons.AlertTriangle className="mr-1 inline h-3 w-3" />
                  {t("settings.exchange_rates.delete_confirm_warning", {
                    currency: rate.fromCurrency,
                  })}
                </p>
              </>
            }
            handleConfirm={() => deleteExchangeRate(rate.id)}
            isPending={isDeletingRate}
            confirmButtonText={t("settings.exchange_rates.delete")}
            confirmButtonVariant="destructive"
            button={
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Icons.Trash className="h-4 w-4" />
                <span className="sr-only">{t("settings.exchange_rates.delete_aria")}</span>
              </Button>
            }
          />
        );
      },
    },
  ],
    [
      t,
      sourceDisplayNames,
      updateExchangeRate,
      deleteExchangeRate,
      isDeletingRate,
    ],
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{t("settings.exchange_rates.title")}</CardTitle>
            <CardDescription>{t("settings.exchange_rates.description")}</CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Icons.PlusCircle className="mr-2 h-4 w-4" />
                {t("settings.exchange_rates.add_rate")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <AddExchangeRateForm
                key={`${addFormKey}-${baseCurrency}`}
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
            <h3 className="mt-4 text-lg font-semibold">{t("settings.exchange_rates.empty_title")}</h3>

            <Button className="mt-4" onClick={() => setIsAddDialogOpen(true)}>
              <Icons.PlusCircle className="mr-2 h-4 w-4" />
              {t("settings.exchange_rates.add_rate")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
