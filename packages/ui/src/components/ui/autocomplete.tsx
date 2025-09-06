import { Command as CommandPrimitive } from 'cmdk';
import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { CommandGroup, CommandItem, CommandList, CommandInput } from '@/components/ui/command';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Icons } from '@/components/ui/icons';

export type Option = Record<'value' | 'label', string> & Record<string, string>;

type AutoCompleteProps = {
  emptyMessage: string;
  value?: Option;
  onValueChange?: (value: Option) => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  search: any;
};

export const AutoComplete = ({
  placeholder,
  emptyMessage,
  value,
  onValueChange,
  disabled,
  isLoading = false,
  search,
}: AutoCompleteProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setOpen] = useState(false);
  const [selected, setSelected] = useState<Option>(value as Option);
  const [inputValue, setInputValue] = useState<string>(value?.label || '');
  const [options, setOptions] = useState<Option[]>([]);

  // Function to fetch options from backend
  const fetchOptions = async (searchValue: string) => {
    const response = await search(searchValue);
    const data = response?.items?.map((item: any) => ({
      label: item.symbol + ' - ' + item.name,
      value: item.symbol,
    }));

    setOptions(data || []);
  };

  useEffect(() => {
    if (inputValue) {
      fetchOptions(inputValue);
    }
  }, [inputValue]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const input = inputRef.current;
      if (!input) {
        return;
      }

      // Keep the options displayed when the user is typing
      if (!isOpen) {
        setOpen(true);
      }

      // This is not a default behaviour of the <input /> field
      if (event.key === 'Enter' && input.value !== '') {
        const optionToSelect = options.find((option) => option.label === input.value);
        if (optionToSelect) {
          setSelected(optionToSelect);
          onValueChange?.(optionToSelect);
        }
        input.blur();
        setOpen(false);
      }

      if (event.key === 'Escape' || event.key === 'Tab') {
        //input.blur();
        setOpen(false);
      }
    },
    [isOpen, options, onValueChange],
  );

  // const handleBlur = useCallback(() => {
  //   setOpen(false);
  //   setInputValue(selected?.label);
  // }, [selected]);

  const handleSelectOption = useCallback(
    (selectedOption: Option) => {
      setInputValue(selectedOption.label);

      setSelected(selectedOption);
      onValueChange?.(selectedOption);

      // This is a hack to prevent the input from being focused after the user selects an option
      // We can call this hack: "The next tick"
      setTimeout(() => {
        inputRef?.current?.blur();
      }, 0);
    },
    [onValueChange],
  );

  return (
    <CommandPrimitive onKeyDown={handleKeyDown}>
      <div className="flex h-10 w-full rounded-md border border-input bg-background  py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
        <CommandInput
          ref={inputRef as any}
          value={inputValue}
          onValueChange={isLoading ? undefined : setInputValue}
          //onBlur={handleBlur}
          //onFocus={() => setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full border-0 border-transparent bg-transparent focus:outline-none focus:ring-0 focus:ring-transparent"
        />
      </div>
      <div className="relative mt-1">
        {isOpen ? (
          <div className="absolute top-0 z-10 w-full rounded-xl bg-background outline-none animate-in fade-in-0 zoom-in-95">
            <CommandList className="rounded-lg ring-1 ring-slate-200">
              {isLoading ? (
                <CommandPrimitive.Loading>
                  <div className="p-1">
                    <Skeleton className="h-8 w-full" />
                  </div>
                </CommandPrimitive.Loading>
              ) : null}
              {options.length > 0 && !isLoading ? (
                <CommandGroup>
                  {options.map((option) => {
                    const isSelected = selected?.value === option.value;
                    return (
                      <CommandItem
                        key={option.value}
                        value={option.label}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onSelect={() => handleSelectOption(option)}
                        className={cn(
                          'flex w-full items-center gap-2',
                          !isSelected ? 'pl-8' : null,
                        )}
                      >
                        {isSelected ? <Icons.Check className="w-4" /> : null}
                        {option.label}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ) : null}
              {!isLoading ? (
                <CommandPrimitive.Empty className="select-none rounded-sm px-2 py-3 text-center text-sm">
                  {emptyMessage}
                </CommandPrimitive.Empty>
              ) : null}
            </CommandList>
          </div>
        ) : null}
      </div>
    </CommandPrimitive>
  );
};
