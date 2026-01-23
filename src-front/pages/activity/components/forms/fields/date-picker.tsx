import { DatePickerInput, FormField, FormItem, FormLabel, FormMessage } from "@wealthfolio/ui";
import { useFormContext, type FieldPath, type FieldValues } from "react-hook-form";
import { today, now, getLocalTimeZone } from "@internationalized/date";

interface DatePickerProps<TFieldValues extends FieldValues = FieldValues> {
  name: FieldPath<TFieldValues>;
  label?: string;
  /** Whether to include time selection */
  enableTime?: boolean;
  /** Granularity of time selection: "hour" | "minute" | "second" */
  timeGranularity?: "hour" | "minute" | "second";
  /** Whether to allow future dates (default: false - future dates not allowed) */
  allowFutureDates?: boolean;
}

export function DatePicker<TFieldValues extends FieldValues = FieldValues>({
  name,
  label = "Date",
  enableTime = true,
  timeGranularity = "minute",
  allowFutureDates = false,
}: DatePickerProps<TFieldValues>) {
  const { control } = useFormContext<TFieldValues>();

  // Calculate maxValue for disabling future dates
  // Use now() for time-enabled pickers to include current time in comparison
  // Use today() for date-only pickers
  const maxValue = allowFutureDates ? undefined : enableTime ? now(getLocalTimeZone()) : today(getLocalTimeZone());

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormLabel>{label}</FormLabel>
          <DatePickerInput
            onChange={(date: Date | undefined) => field.onChange(date)}
            value={field.value}
            disabled={field.disabled}
            enableTime={enableTime}
            timeGranularity={timeGranularity}
            maxValue={maxValue}
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
