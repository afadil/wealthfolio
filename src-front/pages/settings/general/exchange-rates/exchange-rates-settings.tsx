import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { DataTable } from "@wealthfolio/ui/components/ui/data-table";
import { Dialog, DialogContent, DialogTrigger } from "@wealthfolio/ui/components/ui/dialog";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { ExchangeRate } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import { ActionConfirm } from "@wealthfolio/ui";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AddExchangeRateForm } from "./add-exchange-rate-form";
import { RateCell } from "./rate-cell";
import { useExchangeRates } from "./use-exchange-rate";

export function ExchangeRatesSettings() {
  const {
    exchangeRates,
    isLoadingRates,
    updateExchangeRate,
    addExchangeRate,
    deleteExchangeRate,
    isDeletingRate,
  } = useExchangeRates();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const columns: ColumnDef<ExchangeRate>[] = [
    {
      accessorKey: "fromCurrency",
      header: "From",
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
      header: "To",
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
      header: "Source",
      enableHiding: false,
    },
    {
      accessorKey: "rate",
      header: "Rate",
      enableHiding: false,
      cell: ({ row }) => <RateCell rate={row.original} onUpdate={updateExchangeRate} />,
      size: 180,
    },
    {
      accessorKey: "updatedAt",
      header: "Last Updated",
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
            <span className="sr-only">View history</span>
          </Button>
        </Link>
      ),
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const rate = row.original;
        const currencyPair = `${rate.fromCurrency}/${rate.toCurrency}`;

        return (
          <ActionConfirm
            confirmTitle="Delete Exchange Rate"
            confirmMessage={
              <>
                <p className="mb-2">
                  Are you sure you want to delete the <strong>{currencyPair}</strong> exchange rate?
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  <Icons.AlertTriangle className="mr-1 inline h-3 w-3" />
                  If you have holdings or transactions in {rate.fromCurrency}, you may need to
                  recreate this exchange rate for accurate portfolio calculations.
                </p>
              </>
            }
            handleConfirm={() => deleteExchangeRate(rate.id)}
            isPending={isDeletingRate}
            confirmButtonText="Delete"
            confirmButtonVariant="destructive"
            button={
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Icons.Trash className="h-4 w-4" />
                <span className="sr-only">Delete</span>
              </Button>
            }
          />
        );
      },
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Exchange Rates</CardTitle>
            <CardDescription>
              Manage exchange rates for currencies in your portfolio.
            </CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Icons.PlusCircle className="mr-2 h-4 w-4" />
                Add rate
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
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
            <h3 className="mt-4 text-lg font-semibold">No exchange rates defined yet</h3>

            <Button className="mt-4" onClick={() => setIsAddDialogOpen(true)}>
              <Icons.PlusCircle className="mr-2 h-4 w-4" />
              Add rate
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
