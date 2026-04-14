import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@wealthfolio/ui/components/ui/button";
import { Switch } from "@wealthfolio/ui/components/ui/switch";

import { Icons } from "@wealthfolio/ui/components/ui/icons";

import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@wealthfolio/ui/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@wealthfolio/ui/components/ui/form";
import { Input } from "@wealthfolio/ui/components/ui/input";

import { newGoalSchema } from "@/lib/schemas";
import { useGoalMutations } from "@/pages/settings/goals/use-goal-mutations";
import { MoneyInput } from "@wealthfolio/ui";
import { useTranslation } from "react-i18next";

type NewGoal = z.infer<typeof newGoalSchema>;

interface GoalFormlProps {
  defaultValues?: NewGoal;
  onSuccess?: () => void;
}

export function GoalForm({ defaultValues, onSuccess = () => undefined }: GoalFormlProps) {
  const { t } = useTranslation("common");
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
          <DialogTitle>
            {defaultValues?.id ? t("settings.goals.form_title_update") : t("settings.goals.form_title_add")}
          </DialogTitle>
          <DialogDescription>
            {defaultValues?.id ? t("settings.goals.form_desc_update") : t("settings.goals.form_desc_add")}
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
                <FormLabel>{t("settings.goals.label_title")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("settings.goals.placeholder_title")} {...field} />
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
                <FormLabel>{t("settings.goals.label_description")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("settings.goals.placeholder_description")} {...field} />
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
                <FormLabel>{t("settings.goals.label_target")}</FormLabel>
                <FormControl>
                  <MoneyInput placeholder={t("settings.goals.placeholder_target")} {...field} />
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
                  <FormLabel className="space-y-0 pl-2">{t("settings.goals.label_achieved")}</FormLabel>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <DialogTrigger asChild>
            <Button variant="outline">{t("settings.shared.cancel")}</Button>
          </DialogTrigger>
          <Button type="submit">
            <Icons.Plus className="h-4 w-4" />
            <span>
              {defaultValues?.id ? t("settings.goals.submit_update") : t("settings.goals.submit_add")}
            </span>
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
