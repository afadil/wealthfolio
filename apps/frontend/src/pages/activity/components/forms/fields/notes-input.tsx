import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Textarea,
} from "@wealthfolio/ui";
import { useFormContext, type FieldPath, type FieldValues } from "react-hook-form";
import { useTranslation } from "react-i18next";

interface NotesInputProps<TFieldValues extends FieldValues = FieldValues> {
  name: FieldPath<TFieldValues>;
  label?: string;
  placeholder?: string;
  /** Number of visible rows (default: 3) */
  rows?: number;
}

export function NotesInput<TFieldValues extends FieldValues = FieldValues>({
  name,
  label,
  placeholder,
  rows = 3,
}: NotesInputProps<TFieldValues>) {
  const { t } = useTranslation();
  const { control } = useFormContext<TFieldValues>();
  const resolvedLabel = label ?? t("activity.form.fields.comment");
  const resolvedPlaceholder = placeholder ?? t("activity.form.notes_placeholder");

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{resolvedLabel}</FormLabel>
          <FormControl>
            <Textarea
              placeholder={resolvedPlaceholder}
              className="resize-none"
              rows={rows}
              {...field}
              value={field.value || ""}
              aria-label={resolvedLabel}
              data-testid="notes-input"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
