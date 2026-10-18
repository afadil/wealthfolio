import { cn } from "../../lib/utils";
import { Icons } from "../ui/icons";
import { InputGroupAddon } from "../ui/input-group";
import { Button } from "../ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
} from "../ui/combobox";

interface Option {
  value: string;
  label: string;
  className?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  contentClassName?: string;
}

// A select-style field whose list has a search box: shadcn's Combobox with the
// input inside the popup, filtering on the option labels.
export function SearchableSelect({
  options = [],
  value,
  onValueChange,
  placeholder = "Select an option",
  disabled = false,
  searchPlaceholder = "Search...",
  emptyMessage = "No results found.",
  className = "",
  contentClassName = "",
}: SearchableSelectProps) {
  const selectedOption = options.find((option) => option.value === value) ?? null;

  return (
    <Combobox<Option>
      items={options}
      value={selectedOption}
      onValueChange={(option) => {
        if (option) onValueChange(option.value);
      }}
      itemToStringLabel={(option) => option.label}
      isItemEqualToValue={(item, selected) => item.value === selected.value}
      disabled={disabled}
    >
      <ComboboxTrigger
        render={
          <Button
            variant="outline"
            className={cn("w-full justify-between rounded-md font-normal", className)}
            disabled={disabled}
          />
        }
      >
        <span className={cn("truncate", !selectedOption && "text-muted-foreground")}>
          <ComboboxValue placeholder={placeholder} />
        </span>
      </ComboboxTrigger>
      <ComboboxContent className={cn("w-(--anchor-width)", contentClassName)}>
        <ComboboxInput showTrigger={false} placeholder={searchPlaceholder} className="w-full">
          <InputGroupAddon>
            <Icons.Search className="opacity-50" />
          </InputGroupAddon>
        </ComboboxInput>
        <ComboboxSeparator className="mx-0 my-0" />
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
        <ComboboxList>
          {(option: Option) => (
            <ComboboxItem key={option.value} value={option} className={option.className}>
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
