import { useState } from 'react';
import { useExchangeRates } from './useExchangeRate';
import { ExchangeRate } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { SettingsHeader } from '../header';
import { Icons } from '@/components/icons';

function ExchangeRatesPage() {
  const [editingRate, setEditingRate] = useState<ExchangeRate | null>(null);
  const [editedValue, setEditedValue] = useState<number | null>(null);
  const { exchangeRates, isLoading, updateExchangeRate } = useExchangeRates();

  const onSubmit = () => {
    if (editingRate && editedValue !== null) {
      updateExchangeRate({ ...editingRate, rate: editedValue });
      setEditingRate(null);
      setEditedValue(null);
    }
  };

  const handleEdit = (rate: ExchangeRate) => {
    setEditingRate(rate);
    setEditedValue(rate.rate);
  };

  const handleCancelEdit = () => {
    setEditingRate(null);
    setEditedValue(null);
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <SettingsHeader
        heading="Exchange Rates"
        text="Manage and view exchange rates for different currencies."
      />
      <Separator />
      <Tabs defaultValue="manual">
        <TabsList>
          <TabsTrigger value="manual">Manual</TabsTrigger>
          <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
        </TabsList>
        <TabsContent value="manual">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/4">From Currency</TableHead>
                <TableHead className="w-1/4">To Currency</TableHead>
                <TableHead className="w-1/4">Rate</TableHead>
                <TableHead className="w-1/4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exchangeRates
                ?.filter((rate) => rate.source === 'MANUAL')
                .map((rate) => (
                  <TableRow key={rate.id}>
                    <TableCell>{rate.fromCurrency}</TableCell>
                    <TableCell>{rate.toCurrency}</TableCell>
                    <TableCell>
                      <div className="w-full">
                        {editingRate?.id === rate.id ? (
                          <Input
                            type="number"
                            value={editedValue ?? ''}
                            onChange={(e) => setEditedValue(parseFloat(e.target.value))}
                            className="w-full"
                          />
                        ) : (
                          <span>{rate.rate}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end space-x-2">
                        {editingRate?.id === rate.id ? (
                          <>
                            <Button variant="outline" onClick={handleCancelEdit}>
                              Cancel
                            </Button>
                            <Button onClick={onSubmit}>Save</Button>
                          </>
                        ) : (
                          <Button variant="outline" size="icon" onClick={() => handleEdit(rate)}>
                            <Icons.Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TabsContent>
        <TabsContent value="marketplace">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/4">From Currency</TableHead>
                <TableHead className="w-1/4">To Currency</TableHead>
                <TableHead className="w-1/4">Rate</TableHead>
                <TableHead className="w-1/4">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exchangeRates
                ?.filter((rate) => rate.source !== 'MANUAL')
                .map((rate) => (
                  <TableRow key={rate.id}>
                    <TableCell>{rate.fromCurrency}</TableCell>
                    <TableCell>{rate.toCurrency}</TableCell>
                    <TableCell>{rate.rate}</TableCell>
                    <TableCell>{rate.source}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ExchangeRatesPage;
