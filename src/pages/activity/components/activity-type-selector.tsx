import { Control } from 'react-hook-form';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { FormControl, FormField, FormItem } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export interface ActivityType {
  value: string;
  label: string;
  icon: keyof typeof Icons;
}

interface ActivityTypeSelectorProps {
  control: Control<any>;
  types: ActivityType[];
  columns?: number;
  layout?: 'horizontal' | 'vertical';
}

export function ActivityTypeSelector({
  control,
  types,
  columns = 2,
  layout = 'vertical',
}: ActivityTypeSelectorProps) {
  return (
    <FormField
      control={control}
      name="activityType"
      render={({ field, fieldState }) => (
        <FormItem>
          <FormControl>
            <RadioGroup
              onValueChange={field.onChange}
              defaultValue={field.value}
              className={cn(
                'grid gap-2',
                columns === 2 && 'grid-cols-1 sm:grid-cols-2',
                columns === 3 && 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3',
                columns === 4 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
              )}
            >
              {types.map((type) => {
                const Icon = Icons[type.icon];
                return (
                  <div key={type.value}>
                    <RadioGroupItem value={type.value} id={type.value} className="peer sr-only" />
                    <label
                      htmlFor={type.value}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-muted',
                        layout === 'vertical' && 'flex-col items-center justify-center py-3',
                        'min-h-[4rem] sm:min-h-[5rem]',
                        'peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5',
                        'cursor-pointer',
                        fieldState.error && 'border-destructive text-destructive',
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4 sm:h-5 sm:w-5',
                          fieldState.error && 'text-destructive',
                        )}
                      />
                      <span className="text-center">{type.label}</span>
                    </label>
                  </div>
                );
              })}
            </RadioGroup>
          </FormControl>
        </FormItem>
      )}
    />
  );
}
