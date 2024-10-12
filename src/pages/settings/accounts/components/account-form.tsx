import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

import { Icons } from '@/components/icons';
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
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useAccountMutations } from './useAccountMutations';

const accountTypes = [
  { label: 'Securities', value: 'SECURITIES' },
  { label: 'Cash', value: 'CASH' },
  { label: 'Crypto', value: 'CRYPTOCURRENCY' },
] as const;

import { newAccountSchema } from '@/lib/schemas';
import { CurrencyInput } from '@/components/ui/currency-input';

type NewAccount = z.infer<typeof newAccountSchema>;

interface AccountFormlProps {
  defaultValues?: NewAccount;
  onSuccess?: () => void;
}

export function AccountForm({ defaultValues, onSuccess = () => {} }: AccountFormlProps) {
  const { createAccountMutation, updateAccountMutation } = useAccountMutations({ onSuccess });

  const form = useForm<NewAccount>({
    resolver: zodResolver(newAccountSchema),
    defaultValues,
  });

  function onSubmit(data: NewAccount) {
    const { id, ...rest } = data;
    if (id) {
      return updateAccountMutation.mutate({ id, ...rest });
    }
    return createAccountMutation.mutate(rest);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <DialogHeader>
          <DialogTitle> {defaultValues?.id ? 'Update Account' : 'Add Account'}</DialogTitle>
          <DialogDescription>
            {defaultValues?.id
              ? 'Update account information'
              : ' Add an investment account to track.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-10 p-4">
          <input type="hidden" name="id" />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Account Name</FormLabel>
                <FormControl>
                  <Input placeholder="Account display name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="group"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Account Group</FormLabel>
                <FormControl>
                  <Input placeholder="Retirement, 401K, RRSP, TFSA,..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="accountType"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Account Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an account type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {accountTypes.map((type) => (
                      <SelectItem value={type.value} key={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          {!defaultValues?.id ? (
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Currency</FormLabel>
                  <FormControl>
                    <CurrencyInput
                      value={field.value}
                      onChange={(value) => field.onChange(value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}

          <FormField
            control={form.control}
            name="isDefault"
            render={({ field }) => (
              <FormItem className="flex items-center">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="space-y-0 pl-2"> Default Account</FormLabel>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex items-center">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="space-y-0 pl-2"> Is Active</FormLabel>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <DialogFooter>
          <DialogTrigger asChild>
            <Button variant="outline">Cancel</Button>
          </DialogTrigger>
          <Button type="submit">
            <Icons.Plus className="h-4 w-4" />
            <span className="hidden sm:ml-2 sm:inline">
              {defaultValues?.id ? 'Update Account' : 'Add Account'}
            </span>
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
