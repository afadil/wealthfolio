import i18n from "@/i18n/i18n";
import { z } from "zod";

/** Deposit and withdrawal forms share the same shape; messages follow the active UI locale. */
export function createDepositWithdrawalFormSchema() {
  return z.object({
    accountId: z.string().min(1, { message: i18n.t("activity.validation.account_required") }),
    activityDate: z.date({ required_error: i18n.t("activity.validation.select_date") }),
    amount: z.coerce
      .number({
        required_error: i18n.t("activity.validation.enter_amount"),
        invalid_type_error: i18n.t("activity.validation.amount_invalid_type"),
      })
      .positive({ message: i18n.t("activity.validation.amount_greater_than_zero") }),
    comment: z.string().optional().nullable(),
    currency: z.string().min(1, { message: i18n.t("activity.validation.currency_required") }),
    fxRate: z.coerce
      .number({
        invalid_type_error: i18n.t("activity.validation.fx_rate_must_be_number"),
      })
      .positive({ message: i18n.t("activity.validation.fx_rate_positive_short") })
      .optional(),
  });
}

export type DepositWithdrawalFormValues = z.infer<ReturnType<typeof createDepositWithdrawalFormSchema>>;
