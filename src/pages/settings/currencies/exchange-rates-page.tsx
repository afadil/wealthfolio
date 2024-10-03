import { useState } from 'react';
import { useExchangeRates } from './useExchangeRate';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { ExchangeRate } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { RateCell } from './rate-cell';
import { Separator } from '@/components/ui/separator';
import { SettingsHeader } from '../header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { AddExchangeRateForm } from './add-exchange-rate-form';
import { Icons } from '@/components/icons';

export default function ExchangeRatesPage() {
  const { exchangeRates, isLoadingRates, updateExchangeRate, addExchangeRate, deleteExchangeRate } =
    useExchangeRates();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const columns: ColumnDef<ExchangeRate>[] = [
    {
      accessorKey: 'fromCurrency',
      header: 'From',
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
    },
    {
      accessorKey: 'rate',
      header: 'Rate',
      cell: ({ row }) => <RateCell rate={row.original} onUpdate={updateExchangeRate} />,
      size: 180,
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => deleteExchangeRate(row.original.id)}>
          <Icons.Trash className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <SettingsHeader
        heading="Exchange Rates"
        text="Manage and view exchange rates for different currencies."
      >
        <div className="flex justify-end">
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
      </SettingsHeader>
      <Separator />

      {isLoadingRates ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <DataTable columns={columns} data={exchangeRates || []} />
      )}
    </div>
  );
}
