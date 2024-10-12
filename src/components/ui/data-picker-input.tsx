import * as React from 'react';
import { format, isValid, parse } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';

import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Input } from './input';
import { cn } from '@/lib/utils';

interface DatePickerInputProps {
  onChange: (date: Date | undefined) => void;
  value?: string | Date;
  disabled?: boolean;
}

export default function DatePickerInput({ onChange, value, disabled }: DatePickerInputProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(() => {
    if (value instanceof Date) {
      return format(value, 'y-MM-dd');
    }
    return value || '';
  });
  const [date, setDate] = React.useState<Date | undefined>(() => {
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'string') {
      const parsedDate = parse(value, 'y-MM-dd', new Date());
      return isValid(parsedDate) ? parsedDate : undefined;
    }
    return undefined;
  });

  const handleInputChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    setInputValue(e.currentTarget.value);
    const parsedDate = parse(e.currentTarget.value, 'y-MM-dd', new Date());
    if (isValid(parsedDate)) {
      setDate(parsedDate);
      onChange(parsedDate);
    } else {
      setDate(undefined);
      onChange(undefined);
    }
  };

  const handleSelectDate = React.useCallback(
    (selected: Date | undefined) => {
      setDate(selected);
      if (selected) {
        setOpen(false);
        const formattedDate = format(selected, 'y-MM-dd');
        setInputValue(formattedDate);
        onChange(selected);
      } else {
        setInputValue('');
        onChange(undefined);
      }
    },
    [onChange],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <fieldset className="relative">
        <Input placeholder="YYYY-MM-DD" value={inputValue} onChange={handleInputChange} />
        <PopoverTrigger asChild>
          <Button
            aria-label="Pick a date"
            variant={'secondary'}
            className={cn(
              'absolute right-1.5 top-1/2 h-7 -translate-y-1/2 rounded-sm border px-2 font-normal',
              !date && 'text-muted-foreground',
            )}
            disabled={disabled}
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
      </fieldset>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          defaultMonth={date}
          selected={date}
          onSelect={handleSelectDate}
          disabled={disabled}
        />
      </PopoverContent>
    </Popover>
  );
}
