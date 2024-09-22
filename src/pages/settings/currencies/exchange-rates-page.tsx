import { useExchangeRates } from './useExchangeRate';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { ExchangeRate } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { RateCell } from './rate-cell';
import { Separator } from '@/components/ui/separator';
import { SettingsHeader } from '../header';

type ExtendedExchangeRate = ExchangeRate & {
  fromCurrencyName: string;
  toCurrencyName: string;
};

export default function ExchangeRatesPage() {
  const { exchangeRates, isLoadingRates, updateExchangeRate } = useExchangeRates();

  const columns: ColumnDef<ExtendedExchangeRate>[] = [
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
  ];

  return (
    <div className="space-y-6">
      <SettingsHeader
        heading="Exchange Rates"
        text="Manage and view exchange rates for different currencies."
      />
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
