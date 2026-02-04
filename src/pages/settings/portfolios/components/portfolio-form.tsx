import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Icons } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAccounts } from '@/hooks/use-accounts';
import { usePortfolioMutations } from '@/hooks/use-portfolios';
import { newPortfolioSchema } from '@/lib/schemas';

type NewPortfolio = z.infer<typeof newPortfolioSchema>;

interface PortfolioFormProps {
  defaultValues?: NewPortfolio;
  onSuccess?: () => void;
}

export function PortfolioForm({
  defaultValues,
  onSuccess = () => undefined,
}: PortfolioFormProps) {
  const { createPortfolioMutation, updatePortfolioMutation } = usePortfolioMutations({
    onSuccess,
  });

  // Get all active accounts for selection
  const { accounts, isLoading: isLoadingAccounts } = useAccounts(false, false);

  const form = useForm<NewPortfolio>({
    resolver: zodResolver(newPortfolioSchema),
    defaultValues,
  });

  function onSubmit(data: NewPortfolio) {
    const { id, ...rest } = data;
    if (id) {
      return updatePortfolioMutation.mutate({ id, ...rest });
    }
    return createPortfolioMutation.mutate(rest);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <DialogHeader>
          <DialogTitle>
            {defaultValues?.id ? 'Update Portfolio' : 'Add Portfolio'}
          </DialogTitle>
          <DialogDescription>
            {defaultValues?.id
              ? 'Update portfolio information'
              : 'Group multiple accounts into a portfolio with independent allocation strategies.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-10 p-4">
          <input type="hidden" name="id" />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Portfolio Name</FormLabel>
                <FormControl>
                  <Input placeholder="My Portfolio" {...field} />
                </FormControl>
                <FormDescription>
                  A unique name to identify this portfolio.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="accountIds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Accounts</FormLabel>
                <FormDescription>
                  Select at least 2 accounts to group into this portfolio.
                </FormDescription>
                <ScrollArea className="border rounded-md h-[200px] p-4">
                  {isLoadingAccounts ? (
                    <div className="text-sm text-muted-foreground">Loading accounts...</div>
                  ) : accounts && accounts.length > 0 ? (
                    <div className="space-y-3">
                      {accounts.map((account) => (
                        <div key={account.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={account.id}
                            checked={field.value?.includes(account.id)}
                            onCheckedChange={(checked) => {
                              const currentValue = field.value || [];
                              if (checked) {
                                field.onChange([...currentValue, account.id]);
                              } else {
                                field.onChange(
                                  currentValue.filter((id) => id !== account.id),
                                );
                              }
                            }}
                          />
                          <label
                            htmlFor={account.id}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {account.name} ({account.currency})
                          </label>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      No accounts available. Please create accounts first.
                    </div>
                  )}
                </ScrollArea>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <DialogFooter className="gap-2">
          <DialogTrigger asChild>
            <Button variant="outline">Cancel</Button>
          </DialogTrigger>
          <Button type="submit">
            {defaultValues?.id ? (
              <Icons.Save className="h-4 w-4" />
            ) : (
              <Icons.Plus className="h-4 w-4" />
            )}
            <span>{defaultValues?.id ? 'Update Portfolio' : 'Add Portfolio'}</span>
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
