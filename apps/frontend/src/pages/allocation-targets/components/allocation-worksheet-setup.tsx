import {
  Button,
  Checkbox,
  Icons,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useAmountFormatting,
  useNumberFormatting,
} from "@wealthfolio/ui";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { Account, AllocationTarget, DriftReport, WorksheetMode } from "@/lib/types";
import { cn } from "@/lib/utils";

import type { CashToUse } from "./allocation-worksheet-cash";
import { amountAtRest, decimalInputOrZero, formatDecimalInput } from "./allocation-worksheet-utils";

/**
 * An amount field as it reads at rest: the currency's precision, grouped by
 * thousands. Typing shows the digits as entered.
 */
function groupedAtRest(
  value: string,
  fractionDigits: number,
  decimalSeparator: string,
  groupSeparator: string,
): string {
  const atRest = amountAtRest(value, fractionDigits, decimalSeparator);
  const [whole, fraction] = atRest.split(decimalSeparator);
  if (!whole || !/^-?\d+$/.test(whole)) return atRest;
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, groupSeparator);
  return fraction === undefined ? grouped : `${grouped}${decimalSeparator}${fraction}`;
}

const CASH_PRESETS = [0.25, 0.5, 0.75, 1] as const;
/** Past this many accounts, finding one by name beats scanning the list. */
const SEARCH_THRESHOLD = 6;

/**
 * The ledger's columns: account, then cash recorded, cash to use, the
 * contribution and the funding they add up to. On a phone the four amounts
 * wrap under the account, two by two.
 */
const LEDGER_GRID =
  "grid grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:grid-cols-[1.25rem_minmax(0,1fr)_6.5rem_8rem_8rem_7rem]";

export interface WorksheetSetupProps {
  profile: AllocationTarget;
  driftReport: DriftReport;
  currency: string;
  /** Accounts in the target's scope that can hold securities. */
  accounts: Account[];
  selectedAccountIds: readonly string[];
  onToggleAccount: (accountId: string) => void;
  onSelectAllAccounts: () => void;
  onClearAccounts: () => void;
  mode: WorksheetMode;
  onModeChange: (mode: WorksheetMode) => void;
  /** What each selected account records, once the core has read it. */
  recordedByAccount: Readonly<Record<string, number>>;
  cash: CashToUse;
  trackedCash: string | null;
  cashByAccount: Readonly<Record<string, string>> | null;
  onTotalChange: (value: string | null) => void;
  onAccountCashChange: (accountId: string, value: string) => void;
  onUseSameShare: () => void;
  /** Amounts set per account that the last total replaced, with the way back. */
  replacedCash: { onUndo: () => void } | null;
  externalCash: Readonly<Record<string, string>>;
  onExternalCashChange: (accountId: string, value: string) => void;
  /** The eligible securities, under the gap they close. */
  eligibleSecurities: ReactNode;
  /** What stops the calculation, in the order the user meets it. */
  blockingIssues: readonly string[];
  /** Calculate, recalculate or move on, with what the last attempt said. */
  actions: ReactNode;
}

/**
 * Both rows share the side column on wide screens, so it lines up top to
 * bottom. Narrower than xl the ledger's six columns need the full width, while
 * the intent and the cash still sit side by side.
 */
const TOP_COLUMNS =
  "grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]";
const LEDGER_COLUMNS = "grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]";

/**
 * Setup, as a ledger of accounts beside the gap it would close (§4, §6).
 *
 * The two choices that frame everything come first, side by side: what to do,
 * and how much cash it may spend. Money lives in accounts, so the accounts are
 * the page below: each row says what the account records, what it may spend,
 * what would arrive in it, and the funding that leaves it. Beside them, the
 * gap to the target stays in view and holds the one action.
 */
export function WorksheetSetup(props: WorksheetSetupProps) {
  const { t } = useTranslation();
  const { profile, currency } = props;

  return (
    <div className="space-y-6">
      <div className={TOP_COLUMNS}>
        <IntentPicker
          mode={props.mode}
          allowSells={profile.allowSells}
          onModeChange={props.onModeChange}
        />
        <CashToDeploy {...props} />
      </div>

      <div className={LEDGER_COLUMNS}>
        <div className="min-w-0">
          <AccountsLedger {...props} />
        </div>

        <aside
          aria-label={t("allocation:worksheet.summaryLabel")}
          className="min-w-0 space-y-4 xl:sticky xl:top-4"
        >
          <GapToTarget report={props.driftReport} currency={currency} mode={props.mode} />
          {props.eligibleSecurities}
          {/* The step's own action, under the gap rather than part of it. */}
          <div className="space-y-3">
            {props.blockingIssues.length > 0 && (
              <div>
                <p className="text-xs font-medium">{t("allocation:worksheet.blockedTitle")}</p>
                <ul className="mt-1.5 space-y-1">
                  {props.blockingIssues.map((issue) => (
                    <li
                      key={issue}
                      className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px] border-current"
                      />
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {props.actions}
          </div>
        </aside>
      </div>
    </div>
  );
}

function RadioMark({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px]",
        selected ? "border-foreground" : "border-muted-foreground/60",
      )}
    >
      {selected && <span className="bg-foreground h-2 w-2 rounded-full" />}
    </span>
  );
}

function IntentPicker({
  mode,
  allowSells,
  onModeChange,
}: {
  mode: WorksheetMode;
  allowSells: boolean;
  onModeChange: (mode: WorksheetMode) => void;
}) {
  const { t } = useTranslation();
  const options: { value: WorksheetMode; label: string; hint: string }[] = [
    {
      value: "invest_cash",
      label: t("allocation:worksheet.modeInvestCash"),
      hint: t("allocation:worksheet.modeInvestCashHint"),
    },
    {
      value: "rebalance",
      label: t("allocation:worksheet.modeRebalance"),
      hint: t("allocation:worksheet.modeRebalanceHint"),
    },
  ];

  return (
    <section aria-labelledby="worksheet-intent" className="flex min-w-0 flex-col">
      <h4 id="worksheet-intent" className="flex h-7 items-center text-sm font-semibold">
        {t("allocation:worksheet.intentLabel")}
      </h4>
      <div
        id="worksheet-mode"
        role="radiogroup"
        aria-labelledby="worksheet-intent"
        className="mt-2 grid flex-1 gap-2 sm:grid-cols-2"
      >
        {options.map((option) => {
          const selected = mode === option.value;
          const disabled = option.value === "rebalance" && !allowSells;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onModeChange(option.value)}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                selected
                  ? "border-foreground ring-foreground ring-1 ring-inset"
                  : "hover:border-foreground/40",
                disabled && "cursor-not-allowed border-dashed",
              )}
            >
              <RadioMark selected={selected} />
              <span className="min-w-0">
                <span
                  className={cn("block text-sm font-medium", disabled && "text-muted-foreground")}
                >
                  {option.label}
                </span>
                <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
                  {disabled ? t("allocation:mode.enableSellsTip") : option.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface AccountGroup {
  name: string | null;
  accounts: Account[];
}

/** Accounts by the group the user gave them, in the order they first appear; ungrouped ones last. */
function groupAccounts(accounts: readonly Account[]): AccountGroup[] {
  const groups = new Map<string | null, Account[]>();
  for (const account of accounts) {
    const name = account.group?.trim() || null;
    groups.set(name, [...(groups.get(name) ?? []), account]);
  }
  const named = [...groups.entries()].filter(([name]) => name !== null);
  const ungrouped = groups.get(null);
  return [
    ...named.map(([name, members]) => ({ name, accounts: members })),
    ...(ungrouped ? [{ name: null, accounts: ungrouped }] : []),
  ];
}

/**
 * The second line under an account's name. Two accounts can share a name, so
 * the currency is always there, and the end of the account number joins it
 * when name and currency are not enough.
 */
function accountDetails(account: Account, accounts: readonly Account[]): string {
  const twins = accounts.filter(
    (other) =>
      other.id !== account.id &&
      other.name.trim().toLowerCase() === account.name.trim().toLowerCase() &&
      other.currency === account.currency,
  );
  const number = account.accountNumber?.trim();
  return [account.currency, twins.length > 0 && number ? `··${number.slice(-4)}` : null]
    .filter(Boolean)
    .join(" · ");
}

function AccountsLedger({
  accounts,
  selectedAccountIds,
  onToggleAccount,
  onSelectAllAccounts,
  onClearAccounts,
  recordedByAccount,
  cash,
  cashByAccount,
  onAccountCashChange,
  externalCash,
  onExternalCashChange,
  currency,
}: WorksheetSetupProps) {
  const { t } = useTranslation();
  const { formatAmount } = useAmountFormatting();
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const matches = (account: Account) =>
    !normalized ||
    [account.name, account.group, account.currency, account.accountNumber]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalized));
  const groups = groupAccounts(accounts)
    .map((group) => ({ ...group, visible: group.accounts.filter(matches) }))
    .filter((group) => group.visible.length > 0);
  const showGroupNames = groups.some((group) => group.name !== null);
  const selected = new Set(selectedAccountIds);
  const contributionOf = (accountId: string) =>
    Math.max(0, decimalInputOrZero(externalCash[accountId] ?? ""));
  const fundingOf = (accountId: string) =>
    (cash.byAccount[accountId] ?? 0) + contributionOf(accountId);
  const contributions = selectedAccountIds.reduce(
    (sum, accountId) => sum + contributionOf(accountId),
    0,
  );

  return (
    <section id="worksheet-accounts" aria-labelledby="worksheet-accounts-title">
      <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
        <h4 id="worksheet-accounts-title" className="text-sm font-semibold">
          {t("allocation:worksheet.accountsLabel")}
        </h4>
        <span className="text-muted-foreground text-xs">
          {t("allocation:worksheet.selectedAccountCount", {
            selected: selectedAccountIds.length,
            total: accounts.length,
          })}
        </span>
        {/* What the columns already show, a hover away rather than lines of text:
            the rule, and that every amount is in the planning currency, whatever
            the account's own currency on its row. */}
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`${t("allocation:worksheet.ledgerHint")} ${t("allocation:worksheet.amountsInCurrency", { currency })}`}
                className="text-muted-foreground hover:text-foreground self-center"
              >
                <Icons.Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64 space-y-1 text-xs">
              <p>{t("allocation:worksheet.ledgerHint")}</p>
              <p>{t("allocation:worksheet.amountsInCurrency", { currency })}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="mt-2 overflow-hidden rounded-xl border">
        <div className="bg-muted/30 flex flex-wrap items-center gap-2 border-b px-3 py-2">
          {accounts.length > SEARCH_THRESHOLD && (
            <div className="relative min-w-40 flex-1 sm:max-w-60 sm:flex-none">
              <Icons.Search
                aria-hidden="true"
                className="text-muted-foreground absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("allocation:worksheet.findAccount")}
                aria-label={t("allocation:worksheet.findAccount")}
                className="border-input bg-background focus-visible:ring-ring h-8 w-full rounded-md border pl-8 pr-2.5 text-sm outline-none focus-visible:ring-1"
              />
            </div>
          )}
          <div className="ml-auto flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={selectedAccountIds.length === accounts.length}
              onClick={onSelectAllAccounts}
            >
              {t("allocation:worksheet.selectAllAccounts")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={selectedAccountIds.length === 0}
              onClick={onClearAccounts}
            >
              {t("allocation:worksheet.clearAccounts")}
            </Button>
          </div>
        </div>

        <div
          aria-hidden="true"
          className={cn(
            LEDGER_GRID,
            "text-muted-foreground bg-muted/20 hidden border-b px-3 py-2 text-xs font-medium sm:grid",
          )}
        >
          <span />
          <span>{t("allocation:worksheet.account")}</span>
          <span className="text-right">{t("allocation:worksheet.cashRecorded")}</span>
          <span className="text-right">{t("allocation:worksheet.cashToDeploy")}</span>
          <span className="text-right">{t("allocation:worksheet.contribution")}</span>
          <span className="text-right">{t("allocation:worksheet.funding")}</span>
        </div>

        {groups.length === 0 && (
          <p className="text-muted-foreground px-3 py-6 text-center text-sm">
            {t("allocation:worksheet.noMatchingAccounts")}
          </p>
        )}

        {groups.map((group) => {
          const selectedInGroup = group.accounts.filter((account) => selected.has(account.id));
          const subtotal = selectedInGroup.reduce((sum, account) => sum + fundingOf(account.id), 0);
          return (
            <div
              key={group.name ?? "__ungrouped__"}
              role="group"
              aria-label={group.name ?? undefined}
            >
              {showGroupNames && (
                <div className="bg-muted/20 flex items-baseline gap-2 border-t px-3 py-1.5 text-xs first:border-t-0 sm:pl-11">
                  <span className="font-semibold">
                    {group.name ?? t("allocation:worksheet.otherAccounts")}
                  </span>
                  <span className="text-muted-foreground">
                    {t("allocation:worksheet.selectedAccountCount", {
                      selected: selectedInGroup.length,
                      total: group.accounts.length,
                    })}
                  </span>
                  {selectedInGroup.length > 0 && cash.isKnown && (
                    <span className="text-muted-foreground ml-auto font-mono tabular-nums">
                      {formatAmount(subtotal, currency)}
                    </span>
                  )}
                </div>
              )}
              {group.visible.map((account) => (
                <LedgerRow
                  key={account.id}
                  account={account}
                  details={accountDetails(account, accounts)}
                  isSelected={selected.has(account.id)}
                  onToggle={() => onToggleAccount(account.id)}
                  recorded={recordedByAccount[account.id]}
                  use={cash.byAccount[account.id]}
                  enteredUse={cashByAccount?.[account.id]}
                  isAboveRecorded={cash.aboveRecordedAccountIds.includes(account.id)}
                  onUseChange={(value) => onAccountCashChange(account.id, value)}
                  contribution={externalCash[account.id] ?? ""}
                  onContributionChange={(value) => onExternalCashChange(account.id, value)}
                  funding={fundingOf(account.id)}
                  currency={currency}
                />
              ))}
            </div>
          );
        })}

        {/* The columns add up here, the total funding among them. */}
        {selectedAccountIds.length > 0 && cash.isKnown && (
          <div className={cn(LEDGER_GRID, "bg-muted/30 border-t px-3 py-2.5")}>
            <span />
            <span className="text-sm font-semibold">{t("allocation:worksheet.accountTotal")}</span>
            <div className="col-span-2 col-start-2 grid grid-cols-2 gap-2 sm:contents">
              <LedgerCell label={t("allocation:worksheet.cashRecorded")}>
                <span className="text-muted-foreground font-mono text-sm tabular-nums">
                  {formatAmount(cash.recordedTotal, currency)}
                </span>
              </LedgerCell>
              <LedgerCell label={t("allocation:worksheet.cashToDeploy")}>
                <span className="font-mono text-sm tabular-nums">
                  {formatAmount(cash.total, currency)}
                </span>
              </LedgerCell>
              <LedgerCell label={t("allocation:worksheet.contribution")}>
                {contributions > 0 ? (
                  <span className="font-mono text-sm tabular-nums">
                    {formatAmount(contributions, currency)}
                  </span>
                ) : (
                  <span className="text-muted-foreground/60">—</span>
                )}
              </LedgerCell>
              <LedgerCell label={t("allocation:worksheet.fundingTotal")}>
                <span className="font-mono text-sm font-semibold tabular-nums">
                  {formatAmount(cash.total + contributions, currency)}
                </span>
              </LedgerCell>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

interface LedgerRowProps {
  account: Account;
  details: string;
  isSelected: boolean;
  onToggle: () => void;
  /** Undefined while the core has not read it. */
  recorded: number | undefined;
  use: number | undefined;
  /** What the user typed for this account, when they set it themselves. */
  enteredUse: string | undefined;
  isAboveRecorded: boolean;
  onUseChange: (value: string) => void;
  contribution: string;
  onContributionChange: (value: string) => void;
  funding: number;
  currency: string;
}

function LedgerRow({
  account,
  details,
  isSelected,
  onToggle,
  recorded,
  use,
  enteredUse,
  isAboveRecorded,
  onUseChange,
  contribution,
  onContributionChange,
  funding,
  currency,
}: LedgerRowProps) {
  const { t } = useTranslation();
  const { formatAmount, currencyFractionDigits } = useAmountFormatting();
  const fractionDigits = currencyFractionDigits(currency);
  const [isAddingContribution, setIsAddingContribution] = useState(false);
  const checkboxId = `worksheet-account-${account.id}`;
  const isKnown = recorded !== undefined;
  const pending = <Skeleton className="ml-auto h-4 w-16" />;
  const absent = <span className="text-muted-foreground/60">—</span>;
  const showContribution = contribution.trim() !== "" || isAddingContribution;

  return (
    <div
      data-worksheet-account={account.id}
      className={cn(LEDGER_GRID, "border-t px-3 py-2.5", !isSelected && "bg-muted/20")}
    >
      <Checkbox
        id={checkboxId}
        checked={isSelected}
        onCheckedChange={onToggle}
        aria-label={t("allocation:worksheet.includeAccount", { account: account.name })}
      />
      <label htmlFor={checkboxId} className="min-w-0 cursor-pointer">
        <span
          className={cn(
            "block truncate text-sm",
            isSelected ? "font-medium" : "text-muted-foreground",
          )}
        >
          {account.name}
        </span>
        <span className="text-muted-foreground block truncate text-xs">{details}</span>
        {isSelected && isAboveRecorded && recorded !== undefined && (
          <span className="block text-xs text-amber-800 dark:text-amber-200">
            {t("allocation:worksheet.exceedsObservedCashIssue", {
              amount: formatAmount(recorded, currency),
            })}
          </span>
        )}
      </label>

      {/* On a phone the amounts sit under the account, each with its label. */}
      <div className="col-span-2 col-start-2 grid grid-cols-2 gap-2 sm:contents">
        <LedgerCell label={t("allocation:worksheet.cashRecorded")}>
          {!isSelected ? (
            absent
          ) : !isKnown ? (
            pending
          ) : (
            <span
              className={cn(
                "font-mono text-sm tabular-nums",
                recorded === 0 && "text-muted-foreground",
              )}
            >
              {formatAmount(recorded, currency)}
            </span>
          )}
        </LedgerCell>

        <LedgerCell label={t("allocation:worksheet.cashToDeploy")}>
          {!isSelected ? (
            absent
          ) : !isKnown ? (
            pending
          ) : recorded === 0 ? (
            <span className="text-muted-foreground text-xs">
              {t("allocation:worksheet.noCashRecorded")}
            </span>
          ) : (
            <AmountField
              label={t("allocation:worksheet.cashToDeployFor", { account: account.name })}
              value={enteredUse ?? formatDecimalInput(use ?? 0, fractionDigits)}
              fractionDigits={fractionDigits}
              isWarning={isAboveRecorded}
              onChange={onUseChange}
              onBlur={() => {
                // Asking for more than the account records is met with what it
                // records; the rest belongs in the contribution.
                if (isAboveRecorded && recorded !== undefined) {
                  onUseChange(formatDecimalInput(recorded, fractionDigits));
                }
              }}
            />
          )}
        </LedgerCell>

        <LedgerCell label={t("allocation:worksheet.contribution")}>
          {!isSelected ? (
            absent
          ) : showContribution ? (
            <AmountField
              label={t("allocation:worksheet.externalCashForAccount", { account: account.name })}
              value={contribution}
              fractionDigits={fractionDigits}
              isHypothetical
              focusOnOpen={isAddingContribution && contribution === ""}
              onChange={onContributionChange}
              onBlur={() => {
                if (contribution.trim() === "") setIsAddingContribution(false);
              }}
            />
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground h-8 w-full justify-end px-2"
              aria-label={t("allocation:worksheet.addContributionFor", { account: account.name })}
              onClick={() => setIsAddingContribution(true)}
            >
              <Icons.Plus className="mr-1 h-3.5 w-3.5" />
              {t("allocation:worksheet.addContribution")}
            </Button>
          )}
        </LedgerCell>

        <LedgerCell label={t("allocation:worksheet.funding")}>
          {!isSelected ? (
            absent
          ) : !isKnown ? (
            pending
          ) : (
            <span className="font-mono text-sm font-medium tabular-nums">
              {formatAmount(funding, currency)}
            </span>
          )}
        </LedgerCell>
      </div>
    </div>
  );
}

function LedgerCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 text-right">
      <span className="text-muted-foreground block text-left text-[11px] sm:sr-only">{label}</span>
      {children}
    </div>
  );
}

interface AmountFieldProps {
  label: string;
  value: string;
  fractionDigits: number;
  onChange: (value: string) => void;
  onBlur?: () => void;
  isWarning?: boolean;
  /** Cash not recorded anywhere, drawn dashed so it never reads as recorded cash. */
  isHypothetical?: boolean;
  focusOnOpen?: boolean;
}

/** An amount at the currency's precision at rest, and as typed while it has focus. */
function AmountField({
  label,
  value,
  fractionDigits,
  onChange,
  onBlur,
  isWarning,
  isHypothetical,
  focusOnOpen,
}: AmountFieldProps) {
  const { decimalSeparator, groupSeparator } = useNumberFormatting();
  const [isTyping, setIsTyping] = useState(false);
  return (
    <input
      aria-label={label}
      value={
        isTyping ? value : groupedAtRest(value, fractionDigits, decimalSeparator, groupSeparator)
      }
      onChange={(event) => onChange(event.target.value)}
      onFocus={() => setIsTyping(true)}
      onBlur={() => {
        setIsTyping(false);
        onBlur?.();
      }}
      // Opened by the user's own click on Add, so the cursor follows it.
      ref={focusOnOpen ? (element) => element?.focus() : undefined}
      inputMode="decimal"
      placeholder="0"
      className={cn(
        "border-input bg-background focus-visible:ring-ring h-8 w-full rounded-md border px-2 text-right font-mono text-sm tabular-nums outline-none focus-visible:ring-1",
        isHypothetical && "border-dashed",
        isWarning && "border-amber-500 bg-amber-50/60 dark:bg-amber-950/20",
      )}
    />
  );
}

/**
 * What the calculation will try to close, straight from the drift report:
 * how much sits below the target and above it, category by category. A
 * category with no recorded security says so on its row, since its share
 * will stay unresolved.
 */
function GapToTarget({
  report,
  currency,
  mode,
}: {
  report: DriftReport;
  currency: string;
  mode: WorksheetMode;
}) {
  const { t } = useTranslation();
  // Invest cash never reduces, so what sits above the target starts folded
  // until the user opens it.
  const [aboveOpen, setAboveOpen] = useState<boolean | null>(null);
  const showAbove = aboveOpen ?? mode === "rebalance";
  const rows = report.rows.filter((row) => !row.isCash && Math.abs(row.valueDelta) >= 0.5);
  if (rows.length === 0) return null;
  const holdingCategories = report.holdings
    ? new Set(report.holdings.rows.map((row) => row.categoryId))
    : null;
  const below = rows
    .filter((row) => row.valueDelta < 0)
    .sort((left, right) => left.valueDelta - right.valueDelta);
  const above = rows
    .filter((row) => row.valueDelta > 0)
    .sort((left, right) => right.valueDelta - left.valueDelta);

  return (
    <section>
      <div className="flex min-h-7 items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">{t("allocation:worksheet.gapTitle")}</h4>
        {report.outOfBandCount > 0 && (
          <span className="text-muted-foreground text-xs">
            {t("allocation:worksheet.outsideRangeCount", { count: report.outOfBandCount })}
          </span>
        )}
      </div>
      <div className="mt-2 space-y-3 rounded-xl border p-4">
        {below.length > 0 && (
          <GapGroup
            label={t("allocation:worksheet.gapBelowTarget")}
            rows={below}
            currency={currency}
            unrecorded={(row) =>
              holdingCategories !== null && !holdingCategories.has(row.categoryId)
            }
          />
        )}
        {above.length > 0 && (
          <GapGroup
            label={t("allocation:worksheet.gapAboveTarget")}
            rows={above}
            currency={currency}
            isOpen={showAbove}
            onToggle={() => setAboveOpen(!showAbove)}
          />
        )}
      </div>
    </section>
  );
}

function GapGroup({
  label,
  rows,
  currency,
  unrecorded,
  isOpen = true,
  onToggle,
}: {
  label: string;
  rows: DriftReport["rows"];
  currency: string;
  unrecorded?: (row: DriftReport["rows"][number]) => boolean;
  isOpen?: boolean;
  onToggle?: () => void;
}) {
  const { t } = useTranslation();
  const { formatRoundedAmount } = useAmountFormatting();
  const total = rows.reduce((sum, row) => sum + Math.abs(row.valueDelta), 0);
  const heading = (
    <>
      <span className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
        {onToggle && (
          <Icons.ChevronRight
            aria-hidden="true"
            className={cn("h-3 w-3 transition-transform", isOpen && "rotate-90")}
          />
        )}
        {label}
      </span>
      <span className="font-mono text-xs font-semibold tabular-nums">
        {formatRoundedAmount(total, currency)}
      </span>
    </>
  );

  return (
    <div>
      {onToggle ? (
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={onToggle}
          className="flex w-full items-baseline justify-between gap-3 text-left"
        >
          {heading}
        </button>
      ) : (
        <div className="flex items-baseline justify-between gap-3">{heading}</div>
      )}
      {isOpen && (
        <ul className="mt-1.5 space-y-1">
          {rows.map((row) => (
            <li
              key={row.categoryId}
              title={`${(row.currentBps / 100).toFixed(1)}% → ${(row.targetBps / 100).toFixed(1)}%`}
              className="flex items-center gap-2 text-xs"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: row.color }}
              />
              <span className="min-w-0 truncate">{row.categoryName}</span>
              {unrecorded?.(row) && (
                <span className="shrink-0 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  {t("allocation:worksheet.gapNoSecurity")}
                </span>
              )}
              <span className="text-muted-foreground ml-auto shrink-0 font-mono tabular-nums">
                {formatRoundedAmount(Math.abs(row.valueDelta), currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * How much tracked cash the selected accounts may spend, as one total. Setting
 * an account's own amount in the ledger moves the total with it (§6).
 *
 * It sits beside the intent tiles and keeps their height: the amount, the
 * shares beside the label, and one line for the one thing worth saying now.
 */
function CashToDeploy({
  selectedAccountIds,
  cash,
  trackedCash,
  cashByAccount,
  onTotalChange,
  onUseSameShare,
  replacedCash,
  externalCash,
  currency,
}: WorksheetSetupProps) {
  const { t } = useTranslation();
  const { formatAmount, currencyFractionDigits } = useAmountFormatting();
  const { decimalSeparator, groupSeparator } = useNumberFormatting();
  const fractionDigits = currencyFractionDigits(currency);
  const [isTyping, setIsTyping] = useState(false);
  const count = selectedAccountIds.length;
  const isReading = count > 0 && !cash.isKnown;
  const contributions = selectedAccountIds.reduce(
    (sum, accountId) => sum + Math.max(0, decimalInputOrZero(externalCash[accountId] ?? "")),
    0,
  );
  const isCustom = cashByAccount !== null;
  // While one share applies the field shows what was typed; set per account,
  // it shows their sum, and typing in it goes back to one share.
  const totalValue =
    !isCustom && trackedCash !== null
      ? trackedCash
      : cash.isKnown
        ? formatDecimalInput(cash.total, fractionDigits)
        : "";
  const share = cash.share;
  const isPresetShare =
    share !== null && CASH_PRESETS.some((fraction) => Math.abs(share - fraction) < 0.0005);
  const linkClass = "text-foreground font-medium underline underline-offset-2";

  const status = cash.isTotalAboveRecorded ? (
    <span className="text-amber-800 dark:text-amber-200">
      {t("allocation:worksheet.cashAboveRecorded", {
        amount: formatAmount(cash.recordedTotal, currency),
      })}
    </span>
  ) : replacedCash ? (
    <span role="status">
      {t("allocation:worksheet.cashReplaced")}{" "}
      <button type="button" onClick={replacedCash.onUndo} className={linkClass}>
        {t("allocation:worksheet.undo")}
      </button>
    </span>
  ) : isCustom ? (
    <span>
      {t("allocation:worksheet.cashSetPerAccount")}{" "}
      <button type="button" onClick={onUseSameShare} className={linkClass}>
        {t("allocation:worksheet.useSameShare")}
      </button>
    </span>
  ) : cash.isKnown && share !== null && count > 0 && !isPresetShare ? (
    // A preset already says which share applies; a typed total says it here.
    t("allocation:worksheet.cashShare", { percent: formatDecimalInput(share * 100, 1) })
  ) : contributions > 0 ? (
    t("allocation:worksheet.cashPlusContribution", {
      amount: formatAmount(contributions, currency),
    })
  ) : count > 0 ? (
    t("allocation:worksheet.fundingSeparate", { count })
  ) : null;

  return (
    <section id="worksheet-cash" className="flex min-w-0 flex-col">
      <div className="flex h-7 items-center justify-between gap-3">
        <label htmlFor="worksheet-cash-total" className="text-sm font-semibold">
          {t("allocation:worksheet.cashToDeploy")}
        </label>
        <div className="bg-muted/60 flex rounded-full p-0.5">
          {CASH_PRESETS.map((fraction) => {
            const active =
              !isCustom && cash.isKnown && share !== null && Math.abs(share - fraction) < 0.0005;
            return (
              <button
                key={fraction}
                type="button"
                aria-pressed={active}
                disabled={!cash.isKnown || cash.recordedTotal <= 0}
                onClick={() =>
                  onTotalChange(
                    fraction === 1
                      ? null
                      : formatDecimalInput(cash.recordedTotal * fraction, fractionDigits),
                  )
                }
                className={cn(
                  "rounded-full px-2.5 py-0.5 font-mono text-xs transition-colors disabled:opacity-40",
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {fraction === 1 ? t("allocation:worksheet.allCash") : `${fraction * 100}%`}
              </button>
            );
          })}
        </div>
      </div>
      <div className="has-[input:focus]:border-foreground has-[input:focus]:ring-foreground mt-2 flex flex-1 flex-col justify-center gap-1 rounded-lg border px-4 py-3 has-[input:focus]:ring-1 has-[input:focus]:ring-inset">
        <div className="relative flex items-baseline gap-2">
          <span className="text-muted-foreground text-sm">{currency}</span>
          <input
            id="worksheet-cash-total"
            value={
              isTyping
                ? totalValue
                : groupedAtRest(totalValue, fractionDigits, decimalSeparator, groupSeparator)
            }
            onChange={(event) => onTotalChange(event.target.value)}
            onFocus={() => setIsTyping(true)}
            onBlur={() => {
              setIsTyping(false);
              if (cash.isTotalAboveRecorded) onTotalChange(null);
            }}
            disabled={count === 0 || isReading}
            inputMode="decimal"
            placeholder={cash.isKnown ? "0" : ""}
            className="min-w-0 flex-1 bg-transparent font-mono text-xl font-semibold tabular-nums outline-none disabled:opacity-50"
          />
          {isReading && (
            <Skeleton
              aria-hidden="true"
              className="absolute left-10 top-1/2 h-5 w-32 -translate-y-1/2"
            />
          )}
        </div>
        <p className="text-muted-foreground min-h-4 text-xs">{status}</p>
      </div>
    </section>
  );
}
