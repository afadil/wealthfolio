import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import {
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useAccounts } from '@/hooks/use-accounts';
import { usePortfolioMutations, usePortfolios } from '@/hooks/use-portfolios';

interface SaveAsPortfolioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAccountIds: string[];
}

// Create schema that includes duplicate name validation
const createPortfolioNameSchema = (existingNames: string[]) =>
  z.object({
    name: z
      .string()
      .min(2, { message: 'Name must be at least 2 characters.' })
      .max(100, { message: 'Name must not be longer than 100 characters.' })
      .refine(
        (name) => !existingNames.includes(name.toLowerCase()),
        { message: 'This portfolio name is already taken.' }
      ),
  });

type PortfolioNameForm = z.infer<ReturnType<typeof createPortfolioNameSchema>>;

export function SaveAsPortfolioModal({
  open,
  onOpenChange,
  selectedAccountIds,
}: SaveAsPortfolioModalProps) {
  const { accounts } = useAccounts(false, false);
  const { data: portfolios = [] } = usePortfolios();
  const { createPortfolioMutation } = usePortfolioMutations({
    onSuccess: () => {
      form.reset();
      onOpenChange(false);
    },
  });

  // Generate default name from account names
  const defaultName = selectedAccountIds
    .map(id => accounts?.find(a => a.id === id)?.name)
    .filter(Boolean)
    .join(' + ');

  // Create schema with existing portfolio names for duplicate checking
  const existingPortfolioNames = portfolios.map((p: { name: string }) => p.name.toLowerCase());
  const portfolioNameSchema = createPortfolioNameSchema(existingPortfolioNames);

  const form = useForm<PortfolioNameForm>({
    resolver: zodResolver(portfolioNameSchema),
    defaultValues: {
      name: defaultName || '',
    },
    mode: 'onChange',
  });

  // Update the name field whenever the default name changes (e.g., when accounts are loaded)
  useEffect(() => {
    if (open && defaultName && form.getValues('name') !== defaultName) {
      form.setValue('name', defaultName);
    }
  }, [open, defaultName, form]);

  function onSubmit(data: PortfolioNameForm) {
    // We already know we have valid selectedAccountIds from props
    // Just create the portfolio with the name from the form
    createPortfolioMutation.mutate({
      name: data.name,
      accountIds: selectedAccountIds,
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[500px] flex flex-col">
        <DialogHeader>
          <DialogTitle>Save as Portfolio</DialogTitle>
          <DialogDescription>
            Save this account selection as a portfolio for quick access later.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 flex-1">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Portfolio Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="My Portfolio"
                      {...field}
                      disabled={createPortfolioMutation.isPending}
                    />
                  </FormControl>
                  <FormDescription>
                    A unique name to identify this portfolio.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-3">
              <label className="text-sm font-medium">Selected Accounts</label>
              <div className="space-y-2 max-h-[200px] overflow-y-auto p-3 border rounded-md bg-muted/30">
                {selectedAccountIds.map(accountId => {
                  const account = accounts?.find(a => a.id === accountId);
                  return (
                    <div key={accountId} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{account?.name}</p>
                        <p className="text-xs text-muted-foreground">{account?.currency}</p>
                      </div>
                      <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                        Selected
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <DialogFooter className="gap-2 mt-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={createPortfolioMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createPortfolioMutation.isPending || !form.formState.isValid}
              >
                {createPortfolioMutation.isPending ? 'Saving...' : 'Save Portfolio'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
