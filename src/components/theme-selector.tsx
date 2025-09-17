import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FormControl, FormItem, FormLabel } from "@/components/ui/form";

interface ThemeSelectorProps {
  value?: string;
  onChange: (value: string) => void;
  className?: string;
}

export function ThemeSelector({ value, onChange, className }: ThemeSelectorProps) {
  return (
    <RadioGroup
      onValueChange={onChange}
      defaultValue={value}
      className={cn("grid grid-cols-3 gap-2 sm:gap-4", className)}
    >
      <FormItem>
        <FormLabel className="[&:has([data-state=checked])>div]:border-primary cursor-pointer">
          <FormControl>
            <RadioGroupItem value="light" className="sr-only" />
          </FormControl>
          <div className="border-muted hover:border-accent items-center rounded-md border-2 p-1">
            <div className="space-y-1 rounded-sm bg-[hsl(51_59%_95%)] p-1 sm:space-y-2 sm:p-2">
              <div className="space-y-1 rounded-md bg-[hsl(48_100%_97%)] p-1 sm:p-2">
                <div className="h-1 w-[40px] rounded-lg bg-[hsl(50_14%_83%)] sm:h-2 sm:w-[80px]" />
                <div className="h-1 w-[50px] rounded-lg bg-[hsl(50_14%_83%)] sm:h-2 sm:w-[100px]" />
              </div>
              <div className="flex items-center space-x-1 rounded-md bg-[hsl(48_100%_97%)] p-1 sm:space-x-2 sm:p-2">
                <div className="h-2 w-2 rounded-full bg-[hsl(50_14%_83%)] sm:h-4 sm:w-4" />
                <div className="h-1 w-[50px] rounded-lg bg-[hsl(50_14%_83%)] sm:h-2 sm:w-[100px]" />
              </div>
              <div className="flex items-center space-x-1 rounded-md bg-[hsl(48_100%_97%)] p-1 sm:space-x-2 sm:p-2">
                <div className="h-2 w-2 rounded-full bg-[hsl(50_14%_83%)] sm:h-4 sm:w-4" />
                <div className="h-1 w-[50px] rounded-lg bg-[hsl(50_14%_83%)] sm:h-2 sm:w-[100px]" />
              </div>
            </div>
          </div>
          <span className="block w-full p-1 text-center text-xs font-normal sm:p-2 sm:text-sm">
            Light
          </span>
        </FormLabel>
      </FormItem>
      <FormItem>
        <FormLabel className="[&:has([data-state=checked])>div]:border-primary cursor-pointer">
          <FormControl>
            <RadioGroupItem value="dark" className="sr-only" />
          </FormControl>
          <div className="dark border-muted bg-popover hover:bg-accent hover:text-accent-foreground items-center rounded-md border-2 p-1">
            <div className="space-y-1 rounded-sm bg-[hsl(var(--flexoki-bg))] p-1 sm:space-y-2 sm:p-2">
              <div className="space-y-1 rounded-md bg-[hsl(var(--flexoki-bg-2))] p-1 sm:p-2">
                <div className="h-1 w-[40px] rounded-lg bg-[hsl(var(--flexoki-ui-2))] sm:h-2 sm:w-[80px]" />
                <div className="h-1 w-[50px] rounded-lg bg-[hsl(var(--flexoki-ui-2))] sm:h-2 sm:w-[100px]" />
              </div>
              <div className="flex items-center space-x-1 rounded-md bg-[hsl(var(--flexoki-bg-2))] p-1 sm:space-x-2 sm:p-2">
                <div className="h-2 w-2 rounded-full bg-[hsl(var(--flexoki-ui-2))] sm:h-4 sm:w-4" />
                <div className="h-1 w-[50px] rounded-lg bg-[hsl(var(--flexoki-ui-2))] sm:h-2 sm:w-[100px]" />
              </div>
              <div className="flex items-center space-x-1 rounded-md bg-[hsl(var(--flexoki-bg-2))] p-1 sm:space-x-2 sm:p-2">
                <div className="h-2 w-2 rounded-full bg-[hsl(var(--flexoki-ui-2))] sm:h-4 sm:w-4" />
                <div className="h-1 w-[50px] rounded-lg bg-[hsl(var(--flexoki-ui-2))] sm:h-2 sm:w-[100px]" />
              </div>
            </div>
          </div>
          <span className="block w-full p-1 text-center text-xs font-normal sm:p-2 sm:text-sm">
            Dark
          </span>
        </FormLabel>
      </FormItem>
      <FormItem>
        <FormLabel className="[&:has([data-state=checked])>div]:border-primary cursor-pointer">
          <FormControl>
            <RadioGroupItem value="system" className="sr-only" />
          </FormControl>
          <div className="border-muted hover:border-accent items-center rounded-md border-2 p-1">
            <div className="flex overflow-hidden rounded-sm">
              {/* Light half - left side */}
              <div className="w-1/2 space-y-1 bg-[hsl(51_59%_95%)] p-1 sm:space-y-2 sm:p-2">
                <div className="space-y-1 rounded-md bg-[hsl(48_100%_97%)] p-1 sm:p-2">
                  <div className="h-1 w-[20px] rounded-lg bg-[hsl(50_14%_83%)] sm:h-2 sm:w-[40px]" />
                  <div className="h-1 w-[25px] rounded-lg bg-[hsl(50_14%_83%)] sm:h-2 sm:w-[50px]" />
                </div>
                <div className="flex items-center space-x-1 rounded-md bg-[hsl(48_100%_97%)] p-1 sm:p-2">
                  <div className="h-2 w-2 rounded-full bg-[hsl(50_14%_83%)] sm:h-4 sm:w-4" />
                  <div className="h-1 w-[25px] rounded-lg bg-[hsl(50_14%_83%)] sm:h-2 sm:w-[50px]" />
                </div>
                <div className="flex items-center space-x-1 rounded-md bg-[hsl(48_100%_97%)] p-1 sm:p-2">
                  <div className="h-2 w-2 rounded-full bg-[hsl(50_14%_83%)] sm:h-4 sm:w-4" />
                  <div className="h-1 w-[25px] rounded-lg bg-[hsl(50_14%_83%)] sm:h-2 sm:w-[50px]" />
                </div>
              </div>
              {/* Dark half - right side */}
              <div className="dark w-1/2 space-y-1 bg-[hsl(var(--flexoki-bg))] p-1 sm:space-y-2 sm:p-2">
                <div className="space-y-1 rounded-md bg-[hsl(var(--flexoki-bg-2))] p-1 sm:p-2">
                  <div className="h-1 w-[20px] rounded-lg bg-[hsl(var(--flexoki-ui-2))] sm:h-2 sm:w-[40px]" />
                  <div className="h-1 w-[25px] rounded-lg bg-[hsl(var(--flexoki-ui-2))] sm:h-2 sm:w-[50px]" />
                </div>
                <div className="flex items-center space-x-1 rounded-md bg-[hsl(var(--flexoki-bg-2))] p-1 sm:p-2">
                  <div className="h-2 w-2 rounded-full bg-[hsl(var(--flexoki-ui-2))] sm:h-4 sm:w-4" />
                  <div className="h-1 w-[25px] rounded-lg bg-[hsl(var(--flexoki-ui-2))] sm:h-2 sm:w-[50px]" />
                </div>
                <div className="flex items-center space-x-1 rounded-md bg-[hsl(var(--flexoki-bg-2))] p-1 sm:p-2">
                  <div className="h-2 w-2 rounded-full bg-[hsl(var(--flexoki-ui-2))] sm:h-4 sm:w-4" />
                  <div className="h-1 w-[25px] rounded-lg bg-[hsl(var(--flexoki-ui-2))] sm:h-2 sm:w-[50px]" />
                </div>
              </div>
            </div>
          </div>
          <span className="block w-full p-1 text-center text-xs font-normal sm:p-2 sm:text-sm">
            System
          </span>
        </FormLabel>
      </FormItem>
    </RadioGroup>
  );
}
