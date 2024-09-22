import { useExchangeRates } from './useExchangeRate';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { ExchangeRate } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { RateCell } from './rate-cell';
import { Separator } from '@/components/ui/separator';
import { SettingsHeader } from '../header';

export default function ExchangeRatesPage() {
  const { exchangeRateSymbols, isLoadingSymbols, updateExchangeRate } = useExchangeRates();

  const columns: ColumnDef<ExchangeRate>[] = [
    {
      accessorKey: 'fromCurrency',
      header: 'From',
    },
    {
      accessorKey: 'toCurrency',
      header: 'To',
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
      {isLoadingSymbols ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <DataTable columns={columns} data={exchangeRateSymbols || []} />
      )}
    </div>
  );
}
