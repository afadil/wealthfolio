import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Icons } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { newAccountSchema } from "@/lib/schemas";
import { CurrencyInput, ResponsiveSelect, type ResponsiveSelectOption } from "@wealthfolio/ui";

import { useAccountMutations } from "./use-account-mutations";

const accountTypes: ResponsiveSelectOption[] = [
  { label: "Securities", value: "SECURITIES" },
  { label: "Cash", value: "CASH" },
  { label: "Crypto", value: "CRYPTOCURRENCY" },
];

type NewAccount = z.infer<typeof newAccountSchema>;

interface AccountFormlProps {
  defaultValues?: NewAccount;
  onSuccess?: () => void;
}

export function AccountForm({ defaultValues, onSuccess = () => undefined }: AccountFormlProps) {
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
          <DialogTitle> {defaultValues?.id ? "Update Account" : "Add Account"}</DialogTitle>
          <DialogDescription>
            {defaultValues?.id
              ? "Update account information"
              : " Add an investment account to track."}
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
                <FormControl>
                  <ResponsiveSelect
                    value={field.value}
                    onValueChange={field.onChange}
                    options={accountTypes}
                    placeholder="Select an account type"
                    sheetTitle="Select Account Type"
                    sheetDescription="Choose the account type that best matches."
                  />
                </FormControl>
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
                      onChange={(value: string) => field.onChange(value)}
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
            <span>{defaultValues?.id ? "Update Account" : "Add Account"}</span>
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
