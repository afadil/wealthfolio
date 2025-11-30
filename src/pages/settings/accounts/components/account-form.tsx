import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useTranslation } from "react-i18next";

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
import { CurrencyInput, ResponsiveSelect, type ResponsiveSelectOption } from "@wealthvn/ui";

import { useAccountMutations } from "./use-account-mutations";

type NewAccount = z.infer<typeof newAccountSchema>;

interface AccountFormlProps {
  defaultValues?: NewAccount;
  onSuccess?: () => void;
}

export function AccountForm({ defaultValues, onSuccess = () => undefined }: AccountFormlProps) {
  const { createAccountMutation, updateAccountMutation } = useAccountMutations({ onSuccess });
  const { t } = useTranslation("settings");

  const accountTypes: ResponsiveSelectOption[] = [
    { label: t("accounts.form.fields.accountType.options.securities"), value: "SECURITIES" },
    { label: t("accounts.form.fields.accountType.options.cash"), value: "CASH" },
    { label: t("accounts.form.fields.accountType.options.crypto"), value: "CRYPTOCURRENCY" },
  ];

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
          <DialogTitle>
            {" "}
            {defaultValues?.id ? t("accounts.form.updateTitle") : t("accounts.form.addTitle")}
          </DialogTitle>
          <DialogDescription>
            {defaultValues?.id
              ? t("accounts.form.updateDescription")
              : t("accounts.form.addDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-10 p-4">
          <input type="hidden" name="id" />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("accounts.form.fields.name.label")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("accounts.form.fields.name.placeholder")} {...field} />
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
                <FormLabel>{t("accounts.form.fields.group.label")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("accounts.form.fields.group.placeholder")} {...field} />
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
                <FormLabel>{t("accounts.form.fields.accountType.label")}</FormLabel>
                <FormControl>
                  <ResponsiveSelect
                    value={field.value}
                    onValueChange={field.onChange}
                    options={accountTypes}
                    placeholder={t("accounts.form.fields.accountType.placeholder")}
                    sheetTitle={t("accounts.form.fields.accountType.sheetTitle")}
                    sheetDescription={t("accounts.form.fields.accountType.sheetDescription")}
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
                  <FormLabel>{t("accounts.form.fields.currency.label")}</FormLabel>
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
                <FormLabel className="space-y-0 pl-2">
                  {t("accounts.form.fields.isDefault.label")}
                </FormLabel>
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
                <FormLabel className="space-y-0 pl-2">
                  {t("accounts.form.fields.isActive.label")}
                </FormLabel>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <DialogFooter className="gap-2">
          <DialogTrigger asChild>
            <Button variant="outline">{t("accounts.form.buttons.cancel")}</Button>
          </DialogTrigger>
          <Button type="submit">
            {defaultValues?.id ? (
              <Icons.Save className="h-4 w-4" />
            ) : (
              <Icons.Plus className="h-4 w-4" />
            )}
            <span>
              {defaultValues?.id
                ? t("accounts.form.buttons.update")
                : t("accounts.form.buttons.add")}
            </span>
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
