import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';

interface ManualInputProps {
  defaultValue?: string;
  onSymbolChange: (symbol: string) => void;
}

function TickerManualInput({ defaultValue, onSymbolChange }: ManualInputProps) {
  const [symbol, setSymbol] = useState(defaultValue || '');

  useEffect(() => {
    onSymbolChange(symbol);
  }, [symbol, onSymbolChange]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSymbol(e.target.value);
  };

  return (
    <div>
      <Input
        value={symbol}
        onChange={handleChange}
        placeholder="Enter symbol manually"
      />
    </div>
  );
}

export default TickerManualInput;
