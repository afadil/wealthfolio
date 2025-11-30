import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { Card, CardContent } from "@/components/ui/card";

import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
  DatePickerInput,
  Input,
} from "@wealthvn/ui";

import { newContributionLimitSchema } from "@/lib/schemas";
import { useContributionLimitMutations } from "../use-contribution-limit-mutations";
import { MoneyInput } from "@wealthvn/ui";

type NewContributionLimit = z.infer<typeof newContributionLimitSchema>;

type ContributionLimitFormValues = Omit<NewContributionLimit, "limitAmount"> & {
  limitAmount?: number;
};

interface ContributionLimitFormProps {
  defaultValues?: ContributionLimitFormValues;
  onSuccess?: () => void;
}

export function ContributionLimitForm({
  defaultValues,
  onSuccess = () => {},
}: ContributionLimitFormProps) {
  const { t } = useTranslation("settings");
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

    form.setValue("startDate", startDate);
    form.setValue("endDate", endDate);
  };

  // Watch for changes to contributionYear
  const contributionYear = useWatch({
    control: form.control,
    name: "contributionYear",
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
      return updateContributionLimitMutation.mutate(
        { id, updatedLimit: formattedData },
        { onSuccess },
      );
    }
    return addContributionLimitMutation.mutate(formattedData, { onSuccess });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mx-auto w-full max-w-4xl space-y-8">
        <DialogHeader className="px-1">
          <DialogTitle className="text-2xl font-semibold">
            {defaultValues?.id
              ? t("contributionLimits.form.updateTitle")
              : t("contributionLimits.form.addTitle")}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-base">
            {defaultValues?.id
              ? t("contributionLimits.form.updateDescription")
              : t("contributionLimits.form.addDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 px-1">
          {/* Hidden id field */}
          <input type="hidden" name="id" />

          {/* Form content */}
          <Card className="border-border/40 w-full overflow-hidden rounded-lg border shadow-sm">
            <CardContent className="p-6">
              <div className="space-y-6">
                <FormField
                  control={form.control}
                  name="groupName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-medium">
                        {t("contributionLimits.form.fields.groupName.label")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("contributionLimits.form.fields.groupName.placeholder")}
                          {...field}
                          className="h-11 text-base"
                        />
                      </FormControl>
                      <FormDescription className="text-muted-foreground mt-1 text-sm">
                        {t("contributionLimits.form.fields.groupName.description")}
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
                      <FormLabel className="text-base font-medium">
                        {t("contributionLimits.form.fields.limitAmount.label")}
                      </FormLabel>
                      <FormControl>
                        <MoneyInput
                          placeholder={t("contributionLimits.form.fields.limitAmount.placeholder")}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-muted-foreground mt-1 text-sm">
                        {t("contributionLimits.form.fields.limitAmount.description")}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                    <FormField
                      control={form.control}
                      name="contributionYear"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base font-medium">
                            {t("contributionLimits.form.fields.contributionYear.label")}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder={t(
                                "contributionLimits.form.fields.contributionYear.placeholder",
                              )}
                              value={field.value || ""}
                              onChange={(e) => {
                                const numValue =
                                  e.target.value === "" ? undefined : Number(e.target.value);
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
                          <FormLabel className="text-base font-medium">
                            {t("contributionLimits.form.fields.startDate.label")}
                          </FormLabel>
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
                          <FormLabel className="text-base font-medium">
                            {t("contributionLimits.form.fields.endDate.label")}
                          </FormLabel>
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

                  <p className="text-muted-foreground mt-2 text-sm italic">
                    {t("contributionLimits.form.fields.dateNote")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="px-1 pt-2">
          <div className="flex w-full justify-end gap-3">
            <DialogTrigger asChild>
              <Button variant="outline" type="button" className="h-11 min-w-24 text-base">
                {t("contributionLimits.form.buttons.cancel")}
              </Button>
            </DialogTrigger>
            <Button
              type="submit"
              disabled={
                addContributionLimitMutation.isPending || updateContributionLimitMutation.isPending
              }
              className="h-11 min-w-24 text-base"
            >
              {addContributionLimitMutation.isPending ||
              updateContributionLimitMutation.isPending ? (
                <>
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                  {defaultValues?.id
                    ? t("contributionLimits.form.buttons.updating")
                    : t("contributionLimits.form.buttons.saving")}
                </>
              ) : (
                <>
                  <Icons.Check className="mr-2 h-4 w-4" />
                  {defaultValues?.id
                    ? t("contributionLimits.form.buttons.update")
                    : t("contributionLimits.form.buttons.save")}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </Form>
  );
}
