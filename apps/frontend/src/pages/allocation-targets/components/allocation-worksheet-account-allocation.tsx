import { Button, Icons, useAmountFormatting, useNumberFormatting } from "@wealthfolio/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Account, WorksheetAccountFunding } from "@/lib/types";
import { cn } from "@/lib/utils";

import {
  describePlacementProblem,
  displayUnits,
  stepByUnits,
  type PlacementProblem,
} from "./allocation-worksheet-amounts";
import { StepperField } from "./allocation-worksheet-stepper-field";
import {
  allocationProgress,
  AMOUNT_EPSILON,
  amountAtRest,
  decimalInputOrZero,
  formatDecimalInput,
  placementAccountIds,
  type AccountFundingEstimate,
  type PositionAdjustment,
  type WorksheetPosition,
} from "./allocation-worksheet-utils";

interface AccountAllocationProps {
  position: WorksheetPosition;
  changeAmount: number;
  accounts: Account[];
  adjustment: PositionAdjustment;
  currency: string;
  fundingByAccount: Map<string, WorksheetAccountFunding>;
  /** Resolved in the base currency, when the position records one. */
  unitPrice: number | undefined;
  wholeSharesOnly: boolean;
  /** The sole eligible account recording this security, which takes the change until the user splits it (§6). */
  impliedAccountId: string | undefined;
  /** What each account can still fund for this change; absent while cash is read. */
  fundingEstimates: ReadonlyMap<string, AccountFundingEstimate> | undefined;
  /** What the worksheet's check says keeps this change out, if anything. */
  problem: PlacementProblem | undefined;
  onAmountChange: (accountId: string, value: string) => void;
}

/**
 * Where a change sits (§6). A single eligible account takes the whole change;
 * with several, the user places it and nothing is assigned by default.
 */
export function AccountAllocation({
  position,
  changeAmount,
  accounts,
  adjustment,
  currency,
  fundingByAccount,
  unitPrice,
  wholeSharesOnly,
  impliedAccountId,
  fundingEstimates,
  problem,
  onAmountChange,
}: AccountAllocationProps) {
  const { t } = useTranslation();
  const { formatAmount, currencyFractionDigits } = useAmountFormatting();
  const { formatQuantity, decimalSeparator } = useNumberFormatting();
  const fractionDigits = currencyFractionDigits(currency);
  const [typingAccountId, setTypingAccountId] = useState<string | null>(null);
  // At the currency's precision except while it is typed in, like the row's field.
  const atRest = (accountId: string, value: string) =>
    typingAccountId === accountId ? value : amountAtRest(value, fractionDigits, decimalSeparator);
  // The same unit steps as the row: the account's amount moves, the units follow.
  const canStep = unitPrice !== undefined && unitPrice > 0;
  const stepAccount = (accountId: string, amount: number, step: 1 | -1) => {
    if (!unitPrice) return;
    const next = Math.max(0, stepByUnits(amount, unitPrice, step, wholeSharesOnly, fractionDigits));
    onAmountChange(accountId, formatDecimalInput(next, fractionDigits));
  };
  const [showOtherAccounts, setShowOtherAccounts] = useState(false);
  const requested = Math.abs(changeAmount);
  const hasEnteredAmount = accounts.some(
    (account) => (adjustment.accountAmounts[account.id] ?? "").trim() !== "",
  );
  const impliedHolder = hasEnteredAmount ? undefined : impliedAccountId;
  const amountFor = (accountId: string) =>
    impliedHolder === accountId
      ? requested
      : Math.max(0, decimalInputOrZero(adjustment.accountAmounts[accountId] ?? ""));
  const assigned =
    accounts.length === 1
      ? requested
      : accounts.reduce((sum, account) => sum + amountFor(account.id), 0);
  const { isFullyAllocated } = allocationProgress(requested, assigned, AMOUNT_EPSILON);
  const difference = requested - assigned;
  const isReduce = changeAmount < 0;
  const { shown, hidden } = placementAccountIds(
    accounts.map((account) => account.id),
    position.accountHoldings
      .filter((holding) => holding.quantity > 0)
      .map((holding) => holding.accountId),
    accounts
      .filter((account) => (adjustment.accountAmounts[account.id] ?? "").trim() !== "")
      .map((account) => account.id),
  );
  const listedAccounts = showOtherAccounts
    ? accounts
    : accounts.filter((account) => shown.includes(account.id));
  // The listed accounts' own funding, side by side: a fact about each, never
  // pooled across accounts and never a ranking of them (§6).
  const listedCapacity =
    !isReduce && accounts.length > 1 && fundingEstimates
      ? listedAccounts.reduce(
          (sum, account) => sum + (fundingEstimates.get(account.id)?.capacity ?? 0),
          0,
        )
      : undefined;
  const format = (amount: number) => formatAmount(amount, currency);
  // The badge follows the worksheet's own check, so it never calls a change
  // blocked that the check accepts, or the reverse.
  const badge: { text: string; tone: "done" | "accepted" | "problem" | "over" } = problem
    ? {
        text:
          problem.reason === "left"
            ? t("allocation:worksheet.remainingToAllocate", { amount: format(problem.amount) })
            : problem.reason === "not_placed"
              ? t("allocation:worksheet.remainingToAllocate", { amount: format(requested) })
              : describePlacementProblem(problem, t, format),
        tone: problem.reason === "over" ? "over" : "problem",
      }
    : Math.abs(difference) < AMOUNT_EPSILON
      ? { text: t("allocation:worksheet.fullyAllocated"), tone: "done" }
      : {
          text:
            difference > 0
              ? t("allocation:worksheet.allocationAcceptedUnplaced", {
                  amount: format(difference),
                })
              : t("allocation:worksheet.allocationAcceptedOver", { amount: format(-difference) }),
          tone: "accepted",
        };
  // Which accounts record the security is a fact about the portfolio, so it is
  // stated whether or not the user has since placed the change by hand. Only
  // the first sentence — that the app placed it — depends on that.
  const holderName = accounts.find((account) => account.id === impliedAccountId)?.name;
  const hint = isReduce
    ? "allocation:worksheet.reductionAccountAllocationHint"
    : accounts.length === 1
      ? "allocation:worksheet.singleAccountAllocationHint"
      : impliedHolder
        ? "allocation:worksheet.soleHolderAllocationHint"
        : impliedAccountId
          ? "allocation:worksheet.soleHolderSplitHint"
          : "allocation:worksheet.increaseAccountAllocationHint";

  return (
    <div
      data-account-allocation
      className="border-border/60 bg-muted/20 mt-3 rounded-xl border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.12em]">
            {t("allocation:worksheet.accountAllocation")}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">{t(hint, { account: holderName })}</p>
          {listedCapacity !== undefined && listedCapacity < requested - 0.02 && (
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
              {t("allocation:worksheet.placementCanFundTotal", {
                amount: format(listedCapacity),
                requested: format(requested),
              })}
            </p>
          )}
        </div>
        {/* Colour means a problem here; a complete or accepted allocation is not one. */}
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[11px]",
            badge.tone === "done" && "text-foreground border",
            badge.tone === "accepted" && "text-muted-foreground border",
            badge.tone === "over" && "bg-red-100 text-red-900 dark:bg-red-950/35 dark:text-red-200",
            badge.tone === "problem" &&
              "bg-amber-100 text-amber-900 dark:bg-amber-950/35 dark:text-amber-200",
          )}
        >
          {badge.tone === "done" && <Icons.Check className="h-3 w-3" />}
          {badge.text}
        </span>
      </div>

      <div className="mt-3 divide-y">
        {accounts.length === 0 && (
          <p className="text-muted-foreground py-3 text-xs leading-relaxed">
            {t("allocation:worksheet.noEligibleAccounts")}
          </p>
        )}
        {listedAccounts.map((account) => {
          const holding = position.accountHoldings.find((item) => item.accountId === account.id);
          const funding = fundingByAccount.get(account.id);
          const estimate = fundingEstimates?.get(account.id);
          const currentAmount = amountFor(account.id);
          const rowRemaining = Math.max(0, requested - (assigned - currentAmount));
          // What this account can take of the change: what is left, capped by
          // what it can fund (an increase) or holds (a reduction). The user picks
          // the account; the amount is that account's own arithmetic (§6).
          // Funding not read yet leaves the cap off.
          const accountCap = isReduce ? (holding?.value ?? 0) : estimate?.capacity;
          const cappedAmount =
            accountCap === undefined ? rowRemaining : Math.min(rowRemaining, accountCap);
          // The unit price is derived from the recorded holding rather than the
          // quote the core resolves against, so the floor gets a tolerance and
          // never drops a unit over the last decimal. An amount that buys
          // nothing is still offered: the core reports such a line now, and
          // withholding the button only forces the same amount in by hand.
          const wholeUnitAmount =
            wholeSharesOnly && unitPrice
              ? Math.floor(cappedAmount / unitPrice + 1e-9) * unitPrice
              : cappedAmount;
          const amountToUse = wholeUnitAmount > AMOUNT_EPSILON ? wholeUnitAmount : cappedAmount;
          const currentUnits = unitPrice ? currentAmount / unitPrice : undefined;
          return (
            <div
              key={account.id}
              className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                  <span className="truncate">{account.name}</span>
                  {impliedHolder === account.id && (
                    <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-normal">
                      <Icons.Check className="h-2.5 w-2.5" />
                      {t("allocation:worksheet.holdsThisSecurity")}
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground mt-0.5 text-[11px]">
                  {holding &&
                    t("allocation:worksheet.accountHoldingSummary", {
                      amount: formatAmount(holding.value, currency),
                      quantity: formatQuantity(holding.quantity),
                    })}
                  {holding && !isReduce && " · "}
                  {/* An estimate from the page's own figures; the preview then
                      resolves whole units and says what it found. */}
                  {!isReduce &&
                    (estimate
                      ? t("allocation:worksheet.accountCanFund", {
                          amount: format(estimate.capacity),
                        })
                      : t("allocation:worksheet.accountFundingPending"))}
                </p>
                {!isReduce && estimate && estimate.deficit >= AMOUNT_EPSILON && (
                  <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-200">
                    {t("allocation:worksheet.accountFundingDeficit", {
                      amount: format(estimate.deficit),
                    })}
                  </p>
                )}
                {funding && funding.remaining < -AMOUNT_EPSILON && (
                  <p className="mt-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                    {t("allocation:worksheet.fundingNeeded", {
                      amount: formatAmount(-funding.remaining, currency),
                    })}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  {accounts.length === 1 ? (
                    <span className="font-mono text-sm font-semibold tabular-nums">
                      {formatAmount(requested, currency)}
                    </span>
                  ) : (
                    <>
                      {/* The row's field and steps, at the row's width. */}
                      <StepperField
                        className="w-full flex-none sm:w-[13.5rem]"
                        prefix={currency}
                        unitSteps={
                          canStep
                            ? {
                                downLabel: t("allocation:worksheet.removeOneUnitIn", {
                                  account: account.name,
                                }),
                                upLabel: t("allocation:worksheet.addOneUnitIn", {
                                  account: account.name,
                                }),
                                onDown:
                                  currentAmount > AMOUNT_EPSILON
                                    ? () => stepAccount(account.id, currentAmount, -1)
                                    : undefined,
                                onUp: () => stepAccount(account.id, currentAmount, 1),
                              }
                            : undefined
                        }
                        aria-label={t("allocation:worksheet.accountAmountLabel", {
                          account: account.name,
                        })}
                        value={atRest(
                          account.id,
                          impliedHolder === account.id
                            ? formatDecimalInput(requested, 6)
                            : (adjustment.accountAmounts[account.id] ?? ""),
                        )}
                        onFocus={() => setTypingAccountId(account.id)}
                        onBlur={() => setTypingAccountId(null)}
                        onChange={(event) => onAmountChange(account.id, event.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                      />
                      {/* Offered only while it would add to this account: it says the
                          amount, so nothing about it has to be guessed. */}
                      {!isFullyAllocated && amountToUse > currentAmount + AMOUNT_EPSILON && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 font-mono text-[11px] tabular-nums"
                          aria-label={t("allocation:worksheet.useAmountIn", {
                            amount: format(amountToUse),
                            account: account.name,
                          })}
                          onClick={() =>
                            onAmountChange(account.id, formatDecimalInput(amountToUse, 6))
                          }
                        >
                          {t("allocation:worksheet.useAmount", { amount: format(amountToUse) })}
                        </Button>
                      )}
                    </>
                  )}
                </div>
                {currentUnits !== undefined && currentAmount > AMOUNT_EPSILON && (
                  <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
                    {t("allocation:worksheet.accountUnitsSummary", {
                      quantity: formatQuantity(
                        wholeSharesOnly ? Math.floor(currentUnits) : displayUnits(currentUnits),
                      ),
                    })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* Any other account can still receive the change; it opens a new position there. */}
      {!showOtherAccounts && hidden.length > 0 && (
        <button
          type="button"
          onClick={() => setShowOtherAccounts(true)}
          className="text-foreground mt-3 inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
        >
          <Icons.Plus className="h-3.5 w-3.5" />
          {t("allocation:worksheet.placeInAnotherAccount")}
        </button>
      )}
    </div>
  );
}
