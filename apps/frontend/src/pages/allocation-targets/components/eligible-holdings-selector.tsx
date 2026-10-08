import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icons } from "@wealthfolio/ui";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@wealthfolio/ui/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@wealthfolio/ui/components/ui/popover";
import { TickerAvatar } from "@/components/ticker-avatar";
import type { Holding } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  getEligibleHoldings,
  groupEligibleHoldings,
  type EligibleHolding,
} from "./eligible-holdings";

function groupLabel(key: string, t: (key: string) => string): string {
  const labels: Record<string, string> = {
    EQUITY: t("allocation:eligibleHoldings.groups.equity"),
    BOND: t("allocation:eligibleHoldings.groups.bond"),
    CRYPTO: t("allocation:eligibleHoldings.groups.crypto"),
    OPTION: t("allocation:eligibleHoldings.groups.option"),
    METAL: t("allocation:eligibleHoldings.groups.metal"),
    FX: t("allocation:eligibleHoldings.groups.fx"),
    OTHER: t("allocation:eligibleHoldings.groups.other"),
  };
  return labels[key] ?? key;
}

function SelectionMark({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
        selected ? "border-foreground bg-foreground text-background" : "border-border",
      )}
    >
      <Icons.Check className={cn("h-3 w-3", !selected && "opacity-0")} />
    </span>
  );
}

export interface EligibleHoldingsSelectorProps {
  holdings: Holding[];
  excludedAssetIds: ReadonlySet<string>;
  onToggle: (assetId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  /** Account names, so each row says where the security is held. */
  accountNames?: ReadonlyMap<string, string>;
  /**
   * How it reads: a full-width field or a compact chip that opens a list, or
   * a card that shows the selection and expands in place to change it.
   */
  variant?: "field" | "chip" | "card";
  /** Stated in the card above the list: how amounts are split across the selection. */
  rule?: string;
  /** The target's limits, stated under the list. */
  limits?: readonly string[];
  /**
   * Groups securities by the target's categories rather than by type, and
   * says which category below its target would be left with nothing eligible.
   */
  categories?: TargetCategories;
}

export interface TargetCategories {
  /** The target's categories, in the order the target lists them. */
  order: readonly { id: string; name: string; isBelowTarget: boolean }[];
  /** The categories each security counts towards, keyed by asset. */
  byAsset: ReadonlyMap<string, readonly string[]>;
}

interface HoldingGroup {
  key: string;
  heading: string;
  holdings: EligibleHolding[];
  /** A category below its target with nothing eligible: its share stays unresolved. */
  isLeftUnresolved?: boolean;
}

function groupByCategory(
  holdings: readonly EligibleHolding[],
  categories: TargetCategories,
  isSelected: (assetId: string) => boolean,
  t: (key: string, options?: Record<string, unknown>) => string,
): HoldingGroup[] {
  const groups: HoldingGroup[] = categories.order.flatMap((category) => {
    const members = holdings.filter((holding) =>
      (categories.byAsset.get(holding.assetId) ?? []).includes(category.id),
    );
    if (members.length === 0) return [];
    const selected = members.filter((holding) => isSelected(holding.assetId)).length;
    return [
      {
        key: category.id,
        heading: `${category.name} · ${selected}/${members.length}`,
        holdings: members,
        isLeftUnresolved: category.isBelowTarget && selected === 0,
      },
    ];
  });
  const outside = holdings.filter(
    (holding) => (categories.byAsset.get(holding.assetId) ?? []).length === 0,
  );
  if (outside.length > 0) {
    groups.push({
      key: "__outside__",
      heading: t("allocation:eligibleHoldings.notInTarget"),
      holdings: outside,
    });
  }
  return groups;
}

export function EligibleHoldingsSelector({
  holdings,
  excludedAssetIds,
  onToggle,
  onSelectAll,
  onClear,
  accountNames,
  variant = "field",
  categories,
  rule,
  limits = [],
}: EligibleHoldingsSelectorProps) {
  const { t } = useTranslation();
  const eligibleHoldings = useMemo(() => getEligibleHoldings(holdings), [holdings]);
  const groupedHoldings: HoldingGroup[] = categories
    ? groupByCategory(eligibleHoldings, categories, (assetId) => !excludedAssetIds.has(assetId), t)
    : groupEligibleHoldings(eligibleHoldings).map((group) => ({
        key: group.key,
        heading: groupLabel(group.key, t),
        holdings: group.holdings,
      }));
  const selectedCount = eligibleHoldings.reduce(
    (count, holding) => count + (excludedAssetIds.has(holding.assetId) ? 0 : 1),
    0,
  );
  const allSelected = eligibleHoldings.length > 0 && selectedCount === eligibleHoldings.length;
  const summary = allSelected
    ? t("allocation:eligibleHoldings.allSelected")
    : t("allocation:eligibleHoldings.selectedCount", {
        selected: selectedCount,
        total: eligibleHoldings.length,
      });
  const label = t("allocation:eligibleHoldings.label");

  if (variant === "card") {
    return (
      <EligibleCard
        groups={groupedHoldings}
        excludedAssetIds={excludedAssetIds}
        onToggle={onToggle}
        onSelectAll={onSelectAll}
        onClear={onClear}
        accountNames={accountNames}
        summary={t("allocation:eligibleHoldings.selectedCount", {
          selected: selectedCount,
          total: eligibleHoldings.length,
        })}
        selectedCount={selectedCount}
        rule={rule}
        limits={limits}
      />
    );
  }

  // The visible label is the Setup row's; the trigger still names itself.
  return (
    <div>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t("allocation:eligibleHoldings.triggerLabel", { label, summary })}
            className={cn(
              "border-border hover:border-foreground/40 bg-background flex items-center gap-3 rounded-lg border text-left transition-colors",
              variant === "chip"
                ? "h-9 max-w-full px-3"
                : "w-full max-w-[420px] justify-between px-3.5 py-2",
            )}
          >
            {variant === "chip" && (
              <span className="text-muted-foreground shrink-0 text-xs">{label}</span>
            )}
            <span className="text-foreground min-w-0 truncate text-sm font-medium tabular-nums">
              {summary}
            </span>
            <Icons.ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(420px,calc(100vw-2rem))] p-0">
          <Command>
            <CommandInput placeholder={t("allocation:eligibleHoldings.searchPlaceholder")} />
            <CommandList className="max-h-[min(60vh,360px)]">
              <CommandEmpty>{t("allocation:eligibleHoldings.noMatches")}</CommandEmpty>
              {groupedHoldings.map((group) => (
                <CommandGroup
                  key={group.key}
                  heading={
                    <span className="flex flex-col gap-0.5">
                      <span>{group.heading}</span>
                      {group.isLeftUnresolved && (
                        <span className="font-normal normal-case text-amber-800 dark:text-amber-200">
                          {t("allocation:eligibleHoldings.leftUnresolved")}
                        </span>
                      )}
                    </span>
                  }
                >
                  {group.holdings.map((holding) => {
                    const selected = !excludedAssetIds.has(holding.assetId);
                    const details = [holding.exchangeMic, holding.currency]
                      .filter((value): value is string => Boolean(value))
                      .join(" · ");
                    const accounts = accountNames
                      ? holding.accountIds.map((id) => accountNames.get(id) ?? id)
                      : [];
                    return (
                      <CommandItem
                        key={holding.assetId}
                        // A security can count towards several categories; each
                        // row needs its own value, and every one toggles the same choice.
                        value={`${group.key}:${holding.assetId}`}
                        keywords={[
                          holding.symbol,
                          holding.name ?? "",
                          holding.exchangeMic ?? "",
                          holding.currency,
                          ...accounts,
                        ]}
                        onSelect={() => onToggle(holding.assetId)}
                        aria-label={t("allocation:eligibleHoldings.rowLabel", {
                          symbol: holding.symbol,
                          name: holding.name ?? "",
                          details,
                          state: t(
                            selected
                              ? "allocation:eligibleHoldings.selected"
                              : "allocation:eligibleHoldings.notSelected",
                          ),
                        })}
                        className="gap-2"
                      >
                        <SelectionMark selected={selected} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-xs font-semibold">
                            {holding.symbol}
                          </span>
                          {holding.name && (
                            <span className="text-muted-foreground block truncate text-xs">
                              {holding.name}
                            </span>
                          )}
                          <span className="text-muted-foreground/80 block truncate font-mono text-[11px]">
                            {details}
                          </span>
                          {accounts.length > 0 && (
                            <span className="text-muted-foreground/80 block truncate text-[11px]">
                              {t("allocation:eligibleHoldings.inAccounts", {
                                accounts: accounts.join(" · "),
                              })}
                            </span>
                          )}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
            <CommandSeparator />
            <div className="text-muted-foreground flex items-center justify-between px-3 py-2 font-mono text-[11px]">
              <span className="tabular-nums">
                {t("allocation:eligibleHoldings.selectedCount", {
                  selected: selectedCount,
                  total: eligibleHoldings.length,
                })}
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onSelectAll}
                  className="hover:text-foreground rounded px-1.5 py-0.5 transition-colors"
                >
                  {t("allocation:eligibleHoldings.selectAll")}
                </button>
                <button
                  type="button"
                  onClick={onClear}
                  className="hover:text-foreground rounded px-1.5 py-0.5 transition-colors"
                >
                  {t("allocation:eligibleHoldings.clear")}
                </button>
              </span>
            </div>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedCount === 0 && (
        <p className="text-muted-foreground mt-2 font-mono text-xs">
          {t("allocation:eligibleHoldings.emptyAllowed")}
        </p>
      )}
    </div>
  );
}

/** Past this many securities, finding one by name beats scanning the list. */
const CARD_SEARCH_THRESHOLD = 8;
const CARD_STACKED_AVATARS = 5;

/**
 * The selection at a glance, as the dashboard stacks its holdings: a few
 * logos and the count. Opening it lists the securities by target category,
 * so a category left with nothing eligible says so where it happens.
 */
function EligibleCard({
  groups,
  excludedAssetIds,
  onToggle,
  onSelectAll,
  onClear,
  accountNames,
  summary,
  selectedCount,
  rule,
  limits,
}: {
  groups: HoldingGroup[];
  excludedAssetIds: ReadonlySet<string>;
  onToggle: (assetId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  accountNames?: ReadonlyMap<string, string>;
  summary: string;
  selectedCount: number;
  rule?: string;
  limits: readonly string[];
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listId = "worksheet-eligible-securities";
  // A security can sit in several categories; it is one choice and one logo.
  const unique = [
    ...new Map(
      groups.flatMap((group) => group.holdings).map((holding) => [holding.assetId, holding]),
    ).values(),
  ];
  const stacked = unique
    .filter((holding) => !excludedAssetIds.has(holding.assetId))
    .slice(0, CARD_STACKED_AVATARS);
  const normalized = query.trim().toLowerCase();
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      holdings: group.holdings.filter(
        (holding) =>
          !normalized ||
          [holding.symbol, holding.name ?? "", holding.exchangeMic ?? ""].some((value) =>
            value.toLowerCase().includes(normalized),
          ),
      ),
    }))
    .filter((group) => group.holdings.length > 0);

  return (
    <div className="overflow-hidden rounded-xl border">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={listId}
        onClick={() => setIsOpen((open) => !open)}
        className="hover:bg-muted/30 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
      >
        {stacked.length > 0 && (
          <span className="flex shrink-0 items-center">
            {stacked.map((holding, index) => (
              <span
                key={holding.assetId}
                className={cn("relative", index > 0 && "-ml-2")}
                style={{ zIndex: stacked.length - index }}
              >
                <TickerAvatar
                  symbol={holding.symbol}
                  exchangeMic={holding.exchangeMic}
                  instrumentType={holding.instrumentType}
                  assetId={holding.assetId}
                  className="ring-background size-7 ring-2"
                />
              </span>
            ))}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">
            {t("allocation:eligibleHoldings.label")}
          </span>
          <span className="text-muted-foreground block text-xs tabular-nums">{summary}</span>
        </span>
        <Icons.ChevronDown
          aria-hidden="true"
          className={cn(
            "text-muted-foreground h-4 w-4 shrink-0 transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen && (
        <div id={listId} className="border-t">
          {rule && (
            <p className="text-muted-foreground px-4 pt-3 text-xs leading-relaxed">{rule}</p>
          )}
          {unique.length > CARD_SEARCH_THRESHOLD && (
            <div className="relative px-4 pt-3">
              <Icons.Search
                aria-hidden="true"
                className="text-muted-foreground absolute left-6 top-[calc(50%+6px)] h-3.5 w-3.5 -translate-y-1/2"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("allocation:eligibleHoldings.searchPlaceholder")}
                aria-label={t("allocation:eligibleHoldings.searchPlaceholder")}
                className="border-input bg-background focus-visible:ring-ring h-8 w-full rounded-md border pl-8 pr-2.5 text-sm outline-none focus-visible:ring-1"
              />
            </div>
          )}

          <div className="mt-3 max-h-[min(40vh,360px)] overflow-y-auto">
            {visibleGroups.length === 0 && (
              <p className="text-muted-foreground px-4 py-3 text-xs">
                {t("allocation:eligibleHoldings.noMatches")}
              </p>
            )}
            {visibleGroups.map((group) => (
              <div key={group.key} role="group" aria-label={group.heading}>
                <div className="bg-muted/20 border-t px-4 py-1.5 text-xs">
                  <span className="font-semibold">{group.heading}</span>
                  {group.isLeftUnresolved && (
                    <span className="mt-0.5 block text-amber-800 dark:text-amber-200">
                      {t("allocation:eligibleHoldings.leftUnresolved")}
                    </span>
                  )}
                </div>
                {group.holdings.map((holding) => {
                  const selected = !excludedAssetIds.has(holding.assetId);
                  const details = [holding.exchangeMic, holding.currency]
                    .filter((value): value is string => Boolean(value))
                    .join(" · ");
                  const accounts = accountNames
                    ? holding.accountIds.map((id) => accountNames.get(id) ?? id).join(" · ")
                    : "";
                  return (
                    <button
                      key={holding.assetId}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      aria-label={t("allocation:eligibleHoldings.rowLabel", {
                        symbol: holding.symbol,
                        name: holding.name ?? "",
                        details,
                        state: t(
                          selected
                            ? "allocation:eligibleHoldings.selected"
                            : "allocation:eligibleHoldings.notSelected",
                        ),
                      })}
                      title={
                        accounts
                          ? t("allocation:eligibleHoldings.inAccounts", { accounts })
                          : undefined
                      }
                      onClick={() => onToggle(holding.assetId)}
                      className="hover:bg-muted/30 flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors"
                    >
                      <SelectionMark selected={selected} />
                      <TickerAvatar
                        symbol={holding.symbol}
                        exchangeMic={holding.exchangeMic}
                        instrumentType={holding.instrumentType}
                        assetId={holding.assetId}
                        className={cn("size-6 shrink-0", !selected && "opacity-50")}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-xs",
                            !selected && "text-muted-foreground",
                          )}
                        >
                          <span className="font-mono font-semibold">{holding.symbol}</span>
                          {holding.name && (
                            <span className="text-muted-foreground"> {holding.name}</span>
                          )}
                        </span>
                        {details && (
                          <span className="text-muted-foreground/80 block truncate font-mono text-[11px]">
                            {details}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="text-muted-foreground flex items-center gap-2 border-t px-4 py-2 text-xs">
            <span className="min-w-0 flex-1">{limits.join(" · ")}</span>
            <button
              type="button"
              onClick={onSelectAll}
              className="hover:text-foreground shrink-0 rounded px-1.5 py-0.5 transition-colors"
            >
              {t("allocation:eligibleHoldings.selectAll")}
            </button>
            <button
              type="button"
              onClick={onClear}
              className="hover:text-foreground shrink-0 rounded px-1.5 py-0.5 transition-colors"
            >
              {t("allocation:eligibleHoldings.clear")}
            </button>
          </div>
        </div>
      )}
      {selectedCount === 0 && (
        <p className="text-muted-foreground border-t px-4 py-2.5 text-xs">
          {t("allocation:eligibleHoldings.emptyAllowed")}
        </p>
      )}
    </div>
  );
}
