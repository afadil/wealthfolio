import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExchangeRate, Quote } from '@/lib/types';
import { getLatestQuote } from '@/commands/exchange-rates';
import { QueryKeys } from '@/lib/query-keys';
import { Icons } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

interface RateCellProps {
  rate: ExchangeRate;
  onUpdate: (updatedRate: ExchangeRate) => void;
}

export function RateCell({ rate, onUpdate }: RateCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedRate, setEditedRate] = useState(rate.rate.toString());
  const isManual = rate.source === 'MANUAL';

  const { data: quote, isLoading } = useQuery<Quote | null, Error>({
    queryKey: [QueryKeys.QUOTE, `${rate.fromCurrency}${rate.toCurrency}=X`],
    queryFn: () => getLatestQuote(`${rate.fromCurrency}${rate.toCurrency}=X`),
  });

  console.log('++++quote', quote);

  const handleEdit = () => {
    if (!isManual) {
      toast({
        title: 'Cannot edit this rate',
        description: 'Only manual rates can be edited.',
        variant: 'destructive',
      });
      return;
    }
    setIsEditing(true);
    setEditedRate(rate.rate.toString());
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedRate(rate.rate.toString());
  };

  const handleSubmit = () => {
    const newRate = parseFloat(editedRate);
    if (isNaN(newRate) || newRate <= 0) {
      toast({
        title: 'Invalid rate',
        description: 'Please enter a valid positive number.',
        variant: 'destructive',
      });
      return;
    }
    const updatedRate = { ...rate, rate: newRate };
    onUpdate(updatedRate);
    setIsEditing(false);
  };

  if (isLoading) {
    return <Icons.Spinner className="h-4 w-4 animate-spin" />;
  }

  const displayRate = quote ? Math.max(quote.open, quote.close).toFixed(4) : '-';

  return (
    <div className="flex items-center space-x-2">
      <div className="w-24">
        {isManual && isEditing ? (
          <Input
            value={editedRate}
            onChange={(e) => setEditedRate(e.target.value)}
            className="w-full"
          />
        ) : (
          <span>{displayRate}</span>
        )}
      </div>
      {isManual && (
        <div className="flex space-x-1">
          {isEditing ? (
            <>
              <Button variant="outline" size="icon" onClick={handleCancelEdit}>
                <Icons.Close className="h-4 w-4" />
              </Button>
              <Button size="icon" onClick={handleSubmit}>
                <Icons.Check className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button variant="outline" size="icon" onClick={handleEdit}>
              <Icons.Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
