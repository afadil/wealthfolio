import { useState, useMemo } from "react";
import { useFormContext, ControllerRenderProps } from "react-hook-form";
import {
  SUBTYPES_BY_ACTIVITY_TYPE,
  SUBTYPE_DISPLAY_NAMES,
} from "@/lib/constants";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@wealthfolio/ui/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@wealthfolio/ui/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@wealthfolio/ui/components/ui/command";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { cn } from "@wealthfolio/ui/lib/utils";

interface SubtypeSelectProps {
  activityType: string;
}

export function SubtypeSelect({ activityType }: SubtypeSelectProps) {
  const { control } = useFormContext();
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const suggestedSubtypes = useMemo(() => {
    return SUBTYPES_BY_ACTIVITY_TYPE[activityType] || [];
  }, [activityType]);

  // If no subtypes for this activity type, don't render
  if (suggestedSubtypes.length === 0) {
    return null;
  }

  const getDisplayName = (value: string | null | undefined): string => {
    if (!value) return "";
    return SUBTYPE_DISPLAY_NAMES[value] || value;
  };

  return (
    <FormField
      control={control}
      name="subtype"
      render={({ field }: { field: ControllerRenderProps }) => (
        <FormItem className="flex flex-col">
          <FormLabel>
            Subtype <span className="text-muted-foreground text-xs">(optional)</span>
          </FormLabel>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <FormControl>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  className={cn(
                    "h-10 w-full justify-between rounded-lg font-normal",
                    !field.value && "text-muted-foreground"
                  )}
                >
                  {field.value ? getDisplayName(field.value) : "Select subtype..."}
                  <Icons.ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="Search or enter custom..."
                  value={customValue}
                  onValueChange={setCustomValue}
                />
                <CommandList>
                  <CommandEmpty>
                    {customValue ? (
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => {
                          field.onChange(customValue.toUpperCase().replace(/\s+/g, "_"));
                          setOpen(false);
                          setCustomValue("");
                        }}
                      >
                        <Icons.Plus className="mr-2 h-4 w-4" />
                        Use "{customValue}"
                      </Button>
                    ) : (
                      "No subtype found."
                    )}
                  </CommandEmpty>
                  <CommandGroup heading="Suggested">
                    {suggestedSubtypes.map((subtype) => (
                      <CommandItem
                        key={subtype}
                        value={subtype}
                        onSelect={() => {
                          field.onChange(field.value === subtype ? null : subtype);
                          setOpen(false);
                        }}
                      >
                        <Icons.Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            field.value === subtype ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {getDisplayName(subtype)}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {field.value && (
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => {
                          field.onChange(null);
                          setOpen(false);
                        }}
                        className="text-muted-foreground"
                      >
                        <Icons.Close className="mr-2 h-4 w-4" />
                        Clear selection
                      </CommandItem>
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
