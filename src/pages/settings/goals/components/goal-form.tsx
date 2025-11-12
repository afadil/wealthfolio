import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { Icons } from "@/components/ui/icons";

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
import { Input } from "@/components/ui/input";

import { newGoalSchema } from "@/lib/schemas";
import { useGoalMutations } from "@/pages/settings/goals/use-goal-mutations";
import { MoneyInput } from "@wealthfolio/ui";

type NewGoal = z.infer<typeof newGoalSchema>;

interface GoalFormlProps {
  defaultValues?: NewGoal;
  onSuccess?: () => void;
}

export function GoalForm({ defaultValues, onSuccess = () => undefined }: GoalFormlProps) {
  const { t } = useTranslation("settings");
  const { addGoalMutation, updateGoalMutation } = useGoalMutations();

  const form = useForm<NewGoal>({
    resolver: zodResolver(newGoalSchema),
    defaultValues,
  });

  function onSubmit(data: NewGoal) {
    const { id, ...rest } = data;
    if (id) {
      return updateGoalMutation.mutate({ id, ...rest }, { onSuccess });
    }
    return addGoalMutation.mutate(data, { onSuccess });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <DialogHeader>
          <DialogTitle> {defaultValues?.id ? t("goals_form_update_title") : t("goals_form_add_title")}</DialogTitle>
          <DialogDescription>
            {defaultValues?.id ? t("goals_form_update_description") : t("goals_form_add_description")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-10 p-4">
          {/* add input hidden for id */}
          <input type="hidden" name="id" />

          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("goals_form_name_label")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("goals_form_name_placeholder")} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("goals_form_description_label")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("goals_form_description_placeholder")} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="targetAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("goals_form_target_label")}</FormLabel>
                <FormControl>
                  <MoneyInput placeholder={t("goals_form_target_placeholder")} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {defaultValues?.id ? (
            <FormField
              control={form.control}
              name="isAchieved"
              render={({ field }) => (
                <FormItem className="flex items-center">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="space-y-0 pl-2"> {t("goals_form_achieved_label")}</FormLabel>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <DialogTrigger asChild>
            <Button variant="outline">{t("common_cancel")}</Button>
          </DialogTrigger>
          <Button type="submit">
            <Icons.Plus className="h-4 w-4" />
            <span>{defaultValues?.id ? t("goals_form_update_title") : t("goals_form_add_title")}</span>
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
