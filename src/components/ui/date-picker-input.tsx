import * as React from 'react';
import { CalendarIcon } from 'lucide-react';
import {
  Button,
  DatePicker as RacDatePicker,
  DatePickerProps as RacDatePickerProps,
  Dialog,
  Group,
  Popover,
} from 'react-aria-components';
import {
  DateValue,
  parseDate,
  CalendarDate,
  toCalendarDate,
  getLocalTimeZone,
} from '@internationalized/date';

import { Calendar } from '@/components/ui/calendar-rac';
import { DateInput } from '@/components/ui/datefield-rac';
import { cn } from '@/lib/utils';

function toDateValue(value: Date | string | undefined): DateValue | null {
  if (value instanceof Date) {
    return toCalendarDate(new CalendarDate(value.getFullYear(), value.getMonth() + 1, value.getDate()));
  }
  if (typeof value === 'string') {
    try {
      return parseDate(value);
    } catch (error) {
      console.error('Invalid date string format:', value);
      return null;
    }
  }
  return null;
}

function fromDateValue(value: DateValue | null): Date | undefined {
  if (value) {
    return value.toDate(getLocalTimeZone());
  }
  return undefined;
}

interface DatePickerInputProps extends Omit<RacDatePickerProps<DateValue>, 'value' | 'onChange' | 'children' | 'className'> {
  onChange: (date: Date | undefined) => void;
  value?: string | Date;
  disabled?: boolean;
  className?: string;
}

export default function DatePickerInput({
  onChange,
  value,
  disabled,
  className,
  ...props
}: DatePickerInputProps) {
  const racValue = React.useMemo(() => toDateValue(value), [value]);

  const handleRacChange = React.useCallback(
    (newValue: DateValue | null) => {
      onChange(fromDateValue(newValue));
    },
    [onChange],
  );

  return (
    <RacDatePicker
      value={racValue}
      onChange={handleRacChange}
      isDisabled={disabled}
      className={cn(`*:not-first:mt-2`, className)}
      {...props}
    >
      <Group
        className={cn(
          "flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
          "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          disabled && "cursor-not-allowed opacity-50",
         )}
      >
        <DateInput className="flex-1 bg-transparent p-0 outline-none ring-0 placeholder:text-muted-foreground border-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0" />
        <Button
          className={cn(
            "text-muted-foreground/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "flex h-6 w-6 items-center justify-center rounded-sm transition-[color]",
            disabled && "pointer-events-none"
          )}
          aria-label="Pick a date"
        >
          <CalendarIcon size={16} />
        </Button>
      </Group>
      <Popover
        className="bg-background text-popover-foreground data-[entering]:animate-in data-[exiting]:animate-out data-[entering]:fade-in-0 data-[exiting]:fade-out-0 data-[entering]:zoom-in-95 data-[exiting]:zoom-out-95 data-[placement=bottom]:slide-in-from-top-2 data-[placement=left]:slide-in-from-right-2 data-[placement=right]:slide-in-from-left-2 data-[placement=top]:slide-in-from-bottom-2 z-50 rounded-lg border shadow-lg outline-hidden"
        offset={4}
      >
        <Dialog className="max-h-[inherit] overflow-auto p-2 outline-none">
          <Calendar />
        </Dialog>
      </Popover>
    </RacDatePicker>
  );
}
