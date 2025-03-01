import { useState } from 'react';
import { useExchangeRates } from './useExchangeRate';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { ExchangeRate } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { RateCell } from './rate-cell';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { AddExchangeRateForm } from './add-exchange-rate-form';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { formatDate } from '@/lib/utils';

export function ExchangeRatesSettings() {
  const { exchangeRates, isLoadingRates, updateExchangeRate, addExchangeRate, deleteExchangeRate } =
    useExchangeRates();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const columns: ColumnDef<ExchangeRate>[] = [
    {
      accessorKey: 'fromCurrency',
      header: 'From',
      enableHiding: false,
      cell: ({ row }) => (
        <div>
          <div>{row.original.fromCurrency}</div>
          <div className="text-xs text-muted-foreground">{row.original.fromCurrencyName}</div>
        </div>
      ),
    },
    {
      accessorKey: 'toCurrency',
      header: 'To',
      enableHiding: false,
      cell: ({ row }) => (
        <div>
          <div>{row.original.toCurrency}</div>
          <div className="text-xs text-muted-foreground">{row.original.toCurrencyName}</div>
        </div>
      ),
    },
    {
      accessorKey: 'source',
      header: 'Source',
      enableHiding: false,
    },
    {
      accessorKey: 'rate',
      header: 'Rate',
      enableHiding: false,
      cell: ({ row }) => <RateCell rate={row.original} onUpdate={updateExchangeRate} />,
      size: 180,
    },
    {
      accessorKey: 'updatedAt',
      header: 'Last Updated',
      enableHiding: false,
      cell: ({ row }) => (
        <div className="text-sm text-muted-foreground">
          {formatDate(row.original.timestamp)}
        </div>
      ),
    },
    {
      id: 'history',
      enableHiding: false,
      cell: ({ row }) => (
        <Link to={`/holdings/${row.original.id}`} className="flex items-center justify-center">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Icons.Clock className="h-4 w-4" />
            <span className="sr-only">View history</span>
          </Button>
        </Link>
      ),
    },
    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => {
        // Only show delete for Manual source
        if (row.original.source !== 'MANUAL') {
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
                  <h4 className="font-medium leading-none">Delete Exchange Rate</h4>
                  <p className="text-sm text-muted-foreground">
                    Are you sure you want to delete this exchange rate?
                  </p>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteExchangeRate(row.original.id)}
                  >
                    Delete
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
          <DataTable columns={columns} data={exchangeRates}  />
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Icons.DollarSign className="h-12 w-12 text-muted-foreground" />
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
