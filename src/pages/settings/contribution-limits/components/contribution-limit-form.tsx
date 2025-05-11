import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { Card, CardContent } from '@/components/ui/card';

import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import DatePickerInput from '@/components/ui/date-picker-input';

import { newContributionLimitSchema } from '@/lib/schemas';
import { useContributionLimitMutations } from '../use-contribution-limit-mutations';
import { MoneyInput } from '@/components/ui/money-input';

type NewContributionLimit = z.infer<typeof newContributionLimitSchema>;

 type ContributionLimitFormValues = Omit<NewContributionLimit, 'limitAmount'> & { 
  limitAmount?: number 
};

interface ContributionLimitFormProps {
  defaultValues?: ContributionLimitFormValues;
  onSuccess?: () => void;
}

export function ContributionLimitForm({
  defaultValues,
  onSuccess = () => {},
}: ContributionLimitFormProps) {
  const { addContributionLimitMutation, updateContributionLimitMutation } =
    useContributionLimitMutations();

  const form = useForm<NewContributionLimit>({
    resolver: zodResolver(newContributionLimitSchema),
    defaultValues: {
      ...defaultValues,
      startDate: defaultValues?.startDate ? new Date(defaultValues.startDate) : undefined,
      endDate: defaultValues?.endDate ? new Date(defaultValues.endDate) : undefined,
    },
  });

  // Function to update dates based on year
  const updateDatesBasedOnYear = (year: number) => {
    if (!year || isNaN(year)) return;
    
    // Set time to noon to avoid timezone issues
    const startDate = new Date(Date.UTC(year, 0, 1, 12, 0, 0));
    const endDate = new Date(Date.UTC(year, 11, 31, 12, 0, 0));
    
    form.setValue('startDate', startDate);
    form.setValue('endDate', endDate);
  };

  // Watch for changes to contributionYear
  const contributionYear = useWatch({
    control: form.control,
    name: 'contributionYear',
  });

  // Update dates when year changes
  useEffect(() => {
    if (contributionYear) {
      updateDatesBasedOnYear(contributionYear);
    }
  }, [contributionYear]);

  function onSubmit(data: NewContributionLimit) {
    const { id, ...rest } = data;
    
    // Convert date objects to ISO strings (RFC 3339 compatible format)
    const formattedData = {
      ...rest,
      startDate: rest.startDate instanceof Date ? rest.startDate.toISOString() : rest.startDate,
      endDate: rest.endDate instanceof Date ? rest.endDate.toISOString() : rest.endDate,
    };

    if (id) {
      return updateContributionLimitMutation.mutate({ id, updatedLimit: formattedData }, { onSuccess });
    }
    return addContributionLimitMutation.mutate(formattedData, { onSuccess });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 w-full max-w-4xl mx-auto">
        <DialogHeader className="px-1">
          <DialogTitle className="text-2xl font-semibold">
            {defaultValues?.id ? 'Update Contribution Limit' : 'Add Contribution Limit'}
          </DialogTitle>
          <DialogDescription className="text-base text-muted-foreground mt-1">
            {defaultValues?.id
              ? 'Update contribution limit information'
              : 'Add a new contribution limit.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 px-1">
          {/* Hidden id field */}
          <input type="hidden" name="id" />

          {/* Form content */}
          <Card className="border border-border/40 shadow-sm rounded-lg overflow-hidden w-full">
            <CardContent className="p-6">
              <div className="space-y-6">
                <FormField
                  control={form.control}
                  name="groupName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-medium">Group Name</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., TFSA, 401(k), RRSP" 
                          {...field} 
                          className="h-11 text-base"
                        />
                      </FormControl>
                      <FormDescription className="text-sm text-muted-foreground mt-1">
                        Name of the contribution limit group
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            
                <FormField
                  control={form.control}
                  name="limitAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-medium">Limit Amount</FormLabel>
                      <FormControl>
                        <MoneyInput 
                          placeholder="e.g., 6,000.00" 
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription className="text-sm text-muted-foreground mt-1">
                        Maximum contribution amount allowed
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <FormField
                      control={form.control}
                      name="contributionYear"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base font-medium">Year</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="e.g., 2024"
                              value={field.value || ''}
                              onChange={e => {
                                const numValue = e.target.value === '' ? undefined : Number(e.target.value);
                                field.onChange(numValue);
                              }}
                            />
                          </FormControl>
                         
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base font-medium">Start Date</FormLabel>
                          <div className="h-11">
                            <FormControl>
                              <DatePickerInput
                                onChange={(date: Date | undefined) => field.onChange(date)}
                                value={field.value as Date | undefined}
                                disabled={field.disabled}
                              />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base font-medium">End Date</FormLabel>
                          <div className="h-11">
                            <FormControl>
                              <DatePickerInput
                                onChange={(date: Date | undefined) => field.onChange(date)}
                                value={field.value as Date | undefined}
                                disabled={field.disabled}
                              />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <p className="text-sm text-muted-foreground mt-2 italic">
                    Dates default to January 1st through December 31st of the selected year
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="px-1 pt-2">
          <div className="flex gap-3 w-full justify-end">
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                type="button"
                className="min-w-24 h-11 text-base"
              >
                Cancel
              </Button>
            </DialogTrigger>
            <Button 
              type="submit"
              disabled={addContributionLimitMutation.isPending || updateContributionLimitMutation.isPending}
              className="min-w-24 h-11 text-base"
            >
              {(addContributionLimitMutation.isPending || updateContributionLimitMutation.isPending) ? (
                <>
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                  {defaultValues?.id ? 'Updating...' : 'Saving...'}
                </>
              ) : (
                <>
                  <Icons.Check className="mr-2 h-4 w-4" />
                  {defaultValues?.id ? 'Update' : 'Save'}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </Form>
  );
}
