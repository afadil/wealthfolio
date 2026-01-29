import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Textarea,
} from "@wealthfolio/ui";
import { useFormContext, type FieldPath, type FieldValues } from "react-hook-form";

interface NotesInputProps<TFieldValues extends FieldValues = FieldValues> {
  name: FieldPath<TFieldValues>;
  label?: string;
  placeholder?: string;
  /** Number of visible rows (default: 3) */
  rows?: number;
}

export function NotesInput<TFieldValues extends FieldValues = FieldValues>({
  name,
  label = "Notes",
  placeholder = "Add an optional note or comment...",
  rows = 3,
}: NotesInputProps<TFieldValues>) {
  const { control } = useFormContext<TFieldValues>();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea
              placeholder={placeholder}
              className="resize-none"
              rows={rows}
              {...field}
              value={field.value || ""}
              aria-label={label}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
