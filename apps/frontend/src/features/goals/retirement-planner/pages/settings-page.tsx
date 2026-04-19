import type { Account, Holding } from "@/lib/types";
import { generateId } from "@/lib/id";
import { getLatestValuations } from "@/adapters";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
} from "@wealthfolio/ui";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wealthfolio/ui/components/ui/collapsible";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useState, useEffect } from "react";
import type {
  RetirementPlan,
  RetirementIncomeStream,
  PersonalProfile,
  InvestmentAssumptions,
  WithdrawalConfig,
  TaxProfile,
  ExpenseBucket,
} from "../types";
import { DEFAULT_RETIREMENT_PLAN } from "../lib/plan-adapter";
import { runAutoConfig, applyAutoConfig, type AutoConfigResult } from "../lib/auto-config";

interface Props {
  plan: RetirementPlan;
  onSave: (plan: RetirementPlan) => void | Promise<void>;
  isSaving: boolean;
  holdings: Holding[];
  accountIds: string[];
  accounts: Account[];
  /** Accounts already filtered to the FIRE scope — used for auto-config before-retirement return. */
  activeAccounts: Account[];
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs font-medium">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-blue-600"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  min,
  step,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  step?: number;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-muted-foreground text-xs">{prefix}</span>}
        <Input
          type="number"
          value={value ?? ""}
          min={min}
          step={step}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(v);
          }}
          className="h-8 text-sm"
        />
        {suffix && <span className="text-muted-foreground text-xs">{suffix}</span>}
      </div>
    </div>
  );
}

function SettingsSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="hover:bg-muted/50 flex w-full items-center justify-between rounded-t-lg border px-4 py-3 transition-colors">
        <span className="text-sm font-semibold">{title}</span>
        <Icons.ChevronDown
          className={`text-muted-foreground h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-4 rounded-b-lg border border-t-0 px-4 pb-4 pt-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ExpenseBucketRow({
  label,
  bucket,
  onChange,
  generalInflation,
  removable,
  onRemove,
}: {
  label: string;
  bucket: ExpenseBucket;
  onChange: (patch: Partial<ExpenseBucket>) => void;
  generalInflation: number;
  removable?: boolean;
  onRemove?: () => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Label className="font-medium">{label}</Label>
        <div className="flex items-center gap-2">
          {removable && (
            <Button variant="ghost" size="sm" onClick={onRemove}>
              <Icons.X className="h-3 w-3" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowAdvanced(!showAdvanced)}>
            <Icons.Settings className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <NumberField
        label="Monthly spending"
        value={bucket.monthlyAmount}
        onChange={(v) => onChange({ monthlyAmount: v })}
        min={0}
      />
      {showAdvanced && (
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label="Inflation %"
            value={Math.round((bucket.inflationRate ?? generalInflation) * 10000) / 100}
            onChange={(v) => onChange({ inflationRate: v / 100 })}
            step={0.1}
          />
          <NumberField
            label="Start age"
            value={bucket.startAge}
            onChange={(v) => onChange({ startAge: v || undefined })}
          />
          <NumberField
            label="End age"
            value={bucket.endAge}
            onChange={(v) => onChange({ endAge: v || undefined })}
          />
        </div>
      )}
    </div>
  );
}

export default function SettingsPage({
  plan,
  onSave,
  isSaving,
  holdings,
  accountIds,
  accounts,
  activeAccounts,
}: Props) {
  const [draft, setDraft] = useState<RetirementPlan>(plan);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [autoConfigResult, setAutoConfigResult] = useState<AutoConfigResult | null>(null);
  const [autoConfigLoading, setAutoConfigLoading] = useState(false);
  const [syncingStreamId, setSyncingStreamId] = useState<string | null>(null);
  // Local state for streams with startAgeIsAuto behaviour (not persisted in plan)
  const [autoStartAgeIds, setAutoStartAgeIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setDraft(plan);
  }, [plan]);

  // ── Nested updaters ──

  function updatePersonal<K extends keyof PersonalProfile>(key: K, value: PersonalProfile[K]) {
    setDraft((prev) => ({ ...prev, personal: { ...prev.personal, [key]: value } }));
  }

  function updateInvestment<K extends keyof InvestmentAssumptions>(
    key: K,
    value: InvestmentAssumptions[K],
  ) {
    setDraft((prev) => ({ ...prev, investment: { ...prev.investment, [key]: value } }));
  }

  function updateWithdrawal<K extends keyof WithdrawalConfig>(key: K, value: WithdrawalConfig[K]) {
    setDraft((prev) => ({ ...prev, withdrawal: { ...prev.withdrawal, [key]: value } }));
  }

  function updateTax<K extends keyof TaxProfile>(key: K, value: TaxProfile[K]) {
    setDraft((prev) => ({
      ...prev,
      tax: {
        ...(prev.tax ?? {
          taxableWithdrawalRate: 0,
          taxDeferredWithdrawalRate: 0,
          taxFreeWithdrawalRate: 0,
        }),
        [key]: value,
      },
    }));
  }

  function updateExpenseBucket(
    name: "living" | "healthcare" | "housing" | "discretionary",
    patch: Partial<ExpenseBucket>,
  ) {
    setDraft((prev) => ({
      ...prev,
      expenses: {
        ...prev.expenses,
        [name]: { ...(prev.expenses[name] ?? { monthlyAmount: 0 }), ...patch },
      },
    }));
  }

  // ── Auto-config ──

  async function handleAutoConfig() {
    setAutoConfigLoading(true);
    setAutoConfigResult(null);
    try {
      // Fetch activities on demand (only needed for auto-config)
      const { searchActivities } = await import("@/adapters");
      const activitiesResult = await searchActivities(
        0,
        Number.MAX_SAFE_INTEGER,
        { accountIds: accountIds },
        "",
        { id: "date", desc: true },
      );
      const result = await runAutoConfig(activitiesResult.data, holdings, activeAccounts);
      setAutoConfigResult(result);
    } catch (e) {
      toast({
        title: "Auto-config failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setAutoConfigLoading(false);
    }
  }

  function applyDetected() {
    if (!autoConfigResult) return;
    setDraft((prev) => applyAutoConfig(prev, autoConfigResult));
    setAutoConfigResult(null);
    toast({ title: "Auto-config applied \u2014 review and save when ready." });
  }

  // ── Income stream helpers ──

  function addStream() {
    const id = generateId();
    setDraft((prev) => ({
      ...prev,
      incomeStreams: [
        ...prev.incomeStreams,
        {
          id,
          label: `Income ${prev.incomeStreams.length + 1}`,
          streamType: "db",
          monthlyAmount: 0,
          startAge: prev.personal.targetRetirementAge,
          adjustForInflation: true,
        },
      ],
    }));
    setAutoStartAgeIds((prev) => new Set(prev).add(id));
  }

  function updateStream(id: string, patch: Partial<RetirementIncomeStream>) {
    setDraft((prev) => ({
      ...prev,
      incomeStreams: prev.incomeStreams.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }

  async function syncStreamFromAccount(streamId: string, accountId: string) {
    setSyncingStreamId(streamId);
    try {
      const valuations = await getLatestValuations([accountId]);
      const v = valuations?.[0];
      if (v) {
        const value = Math.round(v.totalValue * v.fxRateToBase);
        updateStream(streamId, { currentValue: value });
        toast({ title: `Synced: ${value.toLocaleString()} ${draft.currency}` });
      } else {
        toast({ title: "No valuation found for this account.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Sync failed.", variant: "destructive" });
    } finally {
      setSyncingStreamId(null);
    }
  }

  function removeStream(id: string) {
    setDraft((prev) => ({
      ...prev,
      incomeStreams: prev.incomeStreams.filter((s) => s.id !== id),
    }));
    setAutoStartAgeIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  // ── Target allocation helpers ──

  const allocEntries = Object.entries(draft.investment.targetAllocations);
  const totalAllocPct = allocEntries.reduce((sum, [, w]) => sum + w, 0);
  const allocDiff = Math.abs(totalAllocPct - 1);
  const allocWarning = allocEntries.length > 0 && allocDiff > 0.01;

  function addAllocation() {
    updateInvestment("targetAllocations", { ...draft.investment.targetAllocations, "": 0 });
  }

  function updateAllocation(oldKey: string, newKey: string, weight: number) {
    const next = { ...draft.investment.targetAllocations };
    if (oldKey !== newKey) delete next[oldKey];
    next[newKey] = weight;
    updateInvestment("targetAllocations", next);
  }

  function removeAllocation(key: string) {
    const next = { ...draft.investment.targetAllocations };
    delete next[key];
    updateInvestment("targetAllocations", next);
  }

  function autoDetectAllocations() {
    const totalValue = holdings.reduce((sum, h) => sum + (h.marketValue?.base ?? 0), 0);
    if (totalValue === 0) return;
    const allocs: Record<string, number> = {};
    holdings
      .filter((h) => h.holdingType !== "cash" && (h.marketValue?.base ?? 0) > 0)
      .forEach((h) => {
        const sym = h.instrument?.symbol ?? "";
        if (sym) {
          allocs[sym] = Math.round(((h.marketValue?.base ?? 0) / totalValue) * 100) / 100;
        }
      });
    updateInvestment("targetAllocations", allocs);
  }

  // ── Expenses helpers ──

  function addOptionalBucket(name: "housing" | "discretionary") {
    setDraft((prev) => ({
      ...prev,
      expenses: { ...prev.expenses, [name]: { monthlyAmount: 0 } },
    }));
  }

  function removeOptionalBucket(name: "housing" | "discretionary") {
    setDraft((prev) => {
      const next = { ...prev.expenses };
      delete next[name];
      return { ...prev, expenses: next };
    });
  }

  // ── Reset & Save ──

  function handleReset() {
    setDraft({ ...DEFAULT_RETIREMENT_PLAN, currency: draft.currency });
    setShowResetConfirm(false);
  }

  async function handleSave() {
    // Resolve auto start-age streams before saving
    const resolved: RetirementPlan = {
      ...draft,
      incomeStreams: draft.incomeStreams.map((s) =>
        autoStartAgeIds.has(s.id) ? { ...s, startAge: draft.personal.targetRetirementAge } : s,
      ),
    };
    await onSave(resolved);
  }

  return (
    <div className="space-y-6 pb-8">
      {/* ── Section 1: Core ── */}
      <SettingsSection title="Retirement Timeline" defaultOpen={true}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            label="Current age"
            value={draft.personal.currentAge}
            onChange={(v) => updatePersonal("currentAge", v)}
            min={1}
          />
          <NumberField
            label="Desired retirement age"
            value={draft.personal.targetRetirementAge}
            onChange={(v) => updatePersonal("targetRetirementAge", v)}
            min={1}
          />
          <NumberField
            label="Plan through age"
            value={draft.personal.planningHorizonAge}
            onChange={(v) => updatePersonal("planningHorizonAge", v)}
            min={draft.personal.targetRetirementAge + 1}
          />
          <NumberField
            label={`Monthly contribution until retirement (${draft.currency})`}
            value={draft.investment.monthlyContribution}
            onChange={(v) => updateInvestment("monthlyContribution", v)}
            min={0}
          />
        </div>
        <SliderField
          label="Target withdrawal rate for sizing"
          value={draft.withdrawal.safeWithdrawalRate}
          min={0.025}
          max={0.06}
          step={0.0025}
          displayValue={(draft.withdrawal.safeWithdrawalRate * 100).toFixed(2) + "%"}
          onChange={(v) => updateWithdrawal("safeWithdrawalRate", v)}
        />
      </SettingsSection>

      {/* ── Section 2: Retirement Spending ── */}
      <SettingsSection title="Retirement Spending" defaultOpen={true}>
        <p className="text-muted-foreground text-xs">
          Monthly spending you expect during retirement, entered in today's money.
        </p>
        <ExpenseBucketRow
          label="Living spending"
          bucket={draft.expenses.living}
          onChange={(patch) => updateExpenseBucket("living", patch)}
          generalInflation={draft.investment.inflationRate}
        />
        <ExpenseBucketRow
          label="Healthcare spending"
          bucket={draft.expenses.healthcare}
          onChange={(patch) => updateExpenseBucket("healthcare", patch)}
          generalInflation={draft.investment.inflationRate}
        />
        {draft.expenses.housing && (
          <ExpenseBucketRow
            label="Housing spending"
            bucket={draft.expenses.housing}
            onChange={(patch) => updateExpenseBucket("housing", patch)}
            generalInflation={draft.investment.inflationRate}
            removable
            onRemove={() => removeOptionalBucket("housing")}
          />
        )}
        {draft.expenses.discretionary && (
          <ExpenseBucketRow
            label="Discretionary spending"
            bucket={draft.expenses.discretionary}
            onChange={(patch) => updateExpenseBucket("discretionary", patch)}
            generalInflation={draft.investment.inflationRate}
            removable
            onRemove={() => removeOptionalBucket("discretionary")}
          />
        )}
        <div className="flex gap-2">
          {!draft.expenses.housing && (
            <Button variant="outline" size="sm" onClick={() => addOptionalBucket("housing")}>
              + Housing spending
            </Button>
          )}
          {!draft.expenses.discretionary && (
            <Button variant="outline" size="sm" onClick={() => addOptionalBucket("discretionary")}>
              + Discretionary spending
            </Button>
          )}
        </div>
      </SettingsSection>

      {/* ── Section 3: Retirement Income ── */}
      <SettingsSection title="Retirement Income" defaultOpen={true}>
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs">
            Pension, rental income, part-time work, or annuities expected during retirement. Enter
            amounts as net monthly income in today's money.
          </p>
          <Button variant="outline" size="sm" onClick={addStream}>
            + Add income
          </Button>
        </div>
        {draft.incomeStreams.length === 0 && (
          <p className="text-muted-foreground text-xs">No retirement income added.</p>
        )}
        {draft.incomeStreams.map((stream) => {
          const isDc = stream.streamType === "dc";
          const hasPension =
            isDc ||
            (stream.currentValue ?? 0) > 0 ||
            (stream.monthlyContribution ?? 0) > 0 ||
            (stream.accumulationReturn ?? 0) > 0;

          // Computed payout preview for DC streams (two-phase: contributions until FIRE, growth-only after)
          const totalYears = Math.max(0, stream.startAge - draft.personal.currentAge);
          const contribYears = Math.max(
            0,
            Math.min(stream.startAge, draft.personal.targetRetirementAge) -
              draft.personal.currentAge,
          );
          const growthOnlyYears = totalYears - contribYears;
          const r = stream.accumulationReturn ?? 0.04;
          const fvLump = (stream.currentValue ?? 0) * Math.pow(1 + r, totalYears);
          const fvAnnuityAtStop =
            r > 1e-9
              ? ((stream.monthlyContribution ?? 0) * 12 * (Math.pow(1 + r, contribYears) - 1)) / r
              : (stream.monthlyContribution ?? 0) * 12 * contribYears;
          const fvAnnuity = fvAnnuityAtStop * Math.pow(1 + r, growthOnlyYears);
          const estimatedMonthlyPayout =
            ((fvLump + fvAnnuity) * draft.withdrawal.safeWithdrawalRate) / 12;

          const isAutoStart = autoStartAgeIds.has(stream.id);

          return (
            <div key={stream.id} className="rounded border p-3">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {/* Label */}
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">Label</Label>
                  <Input
                    value={stream.label}
                    onChange={(e) => updateStream(stream.id, { label: e.target.value })}
                    placeholder="e.g. State Pension"
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                {/* Monthly amount (DB only) / computed payout preview (DC) */}
                {isDc ? (
                  <div>
                    <Label className="text-xs">Est. monthly payout ({draft.currency})</Label>
                    <p className="mt-1 flex h-8 items-center text-sm font-medium">
                      {Math.round(estimatedMonthlyPayout).toLocaleString()}
                      <span className="text-muted-foreground ml-1 text-xs">
                        (derived from balance)
                      </span>
                    </p>
                  </div>
                ) : (
                  <div>
                    <Label className="text-xs">Monthly income ({draft.currency})</Label>
                    <Input
                      type="number"
                      value={stream.monthlyAmount ?? 0}
                      min={0}
                      onChange={(e) =>
                        updateStream(stream.id, {
                          monthlyAmount: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                )}
                {/* Payout start age */}
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">Payout start age</Label>
                    <label className="text-muted-foreground flex cursor-pointer items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={isAutoStart}
                        onChange={(e) => {
                          setAutoStartAgeIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) {
                              next.add(stream.id);
                              updateStream(stream.id, {
                                startAge: draft.personal.targetRetirementAge,
                              });
                            } else {
                              next.delete(stream.id);
                            }
                            return next;
                          });
                        }}
                      />
                      Auto
                    </label>
                  </div>
                  {isAutoStart ? (
                    <p className="mt-1 flex h-8 items-center text-sm font-medium">
                      {draft.personal.targetRetirementAge}
                      <span className="text-muted-foreground ml-1 text-xs">(= retirement age)</span>
                    </p>
                  ) : (
                    <Input
                      type="number"
                      value={stream.startAge}
                      min={1}
                      onChange={(e) =>
                        updateStream(stream.id, { startAge: parseInt(e.target.value) || 0 })
                      }
                      className="mt-1 h-8 text-sm"
                    />
                  )}
                </div>
                {/* Inflation-adjusted */}
                <div className="flex flex-col gap-2">
                  <Label className="text-xs">Inflation-adjusted</Label>
                  <Switch
                    checked={stream.annualGrowthRate === undefined && stream.adjustForInflation}
                    disabled={stream.annualGrowthRate !== undefined}
                    onCheckedChange={(v) => updateStream(stream.id, { adjustForInflation: v })}
                  />
                </div>
                {/* Custom growth rate */}
                <div className="col-span-1 sm:col-span-2">
                  <Label className="text-xs">
                    Custom growth rate (%/yr){" "}
                    <span className="text-muted-foreground">
                      {"\u2014"} overrides inflation flag
                    </span>
                  </Label>
                  <div className="mt-1 flex w-40 items-center gap-1">
                    <Input
                      type="number"
                      value={
                        stream.annualGrowthRate !== undefined
                          ? Math.round(stream.annualGrowthRate * 1000) / 10
                          : ""
                      }
                      placeholder="e.g. 1.5"
                      min={0}
                      max={20}
                      step={0.1}
                      onChange={(e) => {
                        const raw = e.target.value;
                        updateStream(stream.id, {
                          annualGrowthRate: raw === "" ? undefined : (parseFloat(raw) || 0) / 100,
                        });
                      }}
                      className="h-8 text-sm"
                    />
                    <span className="text-muted-foreground text-xs">%</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <Switch
                  checked={hasPension}
                  onCheckedChange={(v) => {
                    if (v) {
                      updateStream(stream.id, {
                        streamType: "dc",
                        currentValue: 0,
                        monthlyContribution: 0,
                        accumulationReturn: 0.04,
                      });
                      setAutoStartAgeIds((prev) => new Set(prev).add(stream.id));
                    } else {
                      updateStream(stream.id, {
                        streamType: "db",
                        currentValue: undefined,
                        monthlyContribution: undefined,
                        accumulationReturn: undefined,
                      });
                    }
                  }}
                />
                <Label className="text-muted-foreground cursor-pointer text-xs">
                  Accumulation fund {"\u2014"} payout derived from balance (pension fund, TFR
                  {"\u2026"})
                </Label>
              </div>

              {hasPension && (
                <div className="bg-muted/40 mt-3 grid grid-cols-1 gap-3 rounded p-3 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs">Current fund value ({draft.currency})</Label>
                    <Input
                      type="number"
                      value={stream.currentValue ?? 0}
                      min={0}
                      onChange={(e) =>
                        updateStream(stream.id, {
                          currentValue: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Monthly contribution ({draft.currency})</Label>
                    <Input
                      type="number"
                      value={stream.monthlyContribution ?? 0}
                      min={0}
                      onChange={(e) =>
                        updateStream(stream.id, {
                          monthlyContribution: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Accumulation return (%/yr)</Label>
                    <Input
                      type="number"
                      value={Math.round((stream.accumulationReturn ?? 0.04) * 1000) / 10}
                      min={0}
                      max={20}
                      step={0.1}
                      onChange={(e) =>
                        updateStream(stream.id, {
                          accumulationReturn: (parseFloat(e.target.value) || 0) / 100,
                        })
                      }
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div className="col-span-full space-y-1">
                    <Label className="text-xs">
                      Link to Wealthfolio account{" "}
                      <span className="text-muted-foreground">
                        (optional {"\u2014"} syncs current value)
                      </span>
                    </Label>
                    <div className="flex gap-2">
                      <select
                        value={stream.linkedAccountId ?? ""}
                        onChange={(e) =>
                          updateStream(stream.id, {
                            linkedAccountId: e.target.value || undefined,
                          })
                        }
                        className="border-input bg-background h-8 flex-1 rounded-md border px-2 text-sm"
                      >
                        <option value="">
                          {"\u2014"} Not linked {"\u2014"}
                        </option>
                        {accounts
                          .filter((a) => a.isActive && !a.isArchived)
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.currency})
                            </option>
                          ))}
                      </select>
                      {stream.linkedAccountId && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          disabled={syncingStreamId === stream.id}
                          onClick={() => syncStreamFromAccount(stream.id, stream.linkedAccountId!)}
                        >
                          {syncingStreamId === stream.id ? "Syncing\u2026" : "Sync value"}
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-muted-foreground col-span-full text-xs">
                    Phase 1 (now {"\u2192"} FIRE): fund grows with contributions + return. Phase 2
                    (FIRE {"\u2192"} payout age): contributions stop, fund keeps growing. Phase 3
                    (payout age+): balance converted to income using the same withdrawal rate as the
                    main portfolio.
                  </p>
                </div>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-6 text-xs text-red-500 hover:text-red-600"
                onClick={() => removeStream(stream.id)}
              >
                Remove
              </Button>
            </div>
          );
        })}
      </SettingsSection>

      {/* ── Section 4: Portfolio Assumptions ── */}
      <SettingsSection title="Portfolio Assumptions" defaultOpen={true}>
        <SliderField
          label="Return before retirement"
          value={draft.investment.preRetirementAnnualReturn}
          min={0.03}
          max={0.12}
          step={0.005}
          displayValue={(draft.investment.preRetirementAnnualReturn * 100).toFixed(1) + "%"}
          onChange={(v) => updateInvestment("preRetirementAnnualReturn", v)}
        />
        <SliderField
          label="Return during retirement"
          value={draft.investment.retirementAnnualReturn}
          min={0}
          max={0.1}
          step={0.005}
          displayValue={(draft.investment.retirementAnnualReturn * 100).toFixed(1) + "%"}
          onChange={(v) => updateInvestment("retirementAnnualReturn", v)}
        />
        <SliderField
          label="Annual investment fee"
          value={draft.investment.annualInvestmentFeeRate}
          min={0}
          max={0.03}
          step={0.001}
          displayValue={(draft.investment.annualInvestmentFeeRate * 100).toFixed(2) + "%"}
          onChange={(v) => updateInvestment("annualInvestmentFeeRate", v)}
        />
        <p className="text-muted-foreground text-xs">
          Effective returns after fees: before retirement{" "}
          {(
            (draft.investment.preRetirementAnnualReturn -
              draft.investment.annualInvestmentFeeRate) *
            100
          ).toFixed(2)}
          %, during retirement{" "}
          {(
            (draft.investment.retirementAnnualReturn - draft.investment.annualInvestmentFeeRate) *
            100
          ).toFixed(2)}
          %. The engine uses these net values in each phase.
        </p>
        <SliderField
          label="Annual volatility"
          value={draft.investment.annualVolatility}
          min={0.05}
          max={0.25}
          step={0.005}
          displayValue={(draft.investment.annualVolatility * 100).toFixed(1) + "%"}
          onChange={(v) => updateInvestment("annualVolatility", v)}
        />
        <p className="text-muted-foreground text-xs">
          Volatility is used only for Monte Carlo simulation. Higher values produce a wider fan of
          outcomes.
        </p>
        <SliderField
          label="Inflation rate"
          value={draft.investment.inflationRate}
          min={0.01}
          max={0.05}
          step={0.0025}
          displayValue={(draft.investment.inflationRate * 100).toFixed(2) + "%"}
          onChange={(v) => updateInvestment("inflationRate", v)}
        />
        <SliderField
          label={
            (draft.personal.salaryGrowthRate !== undefined
              ? "Salary growth rate (per year)"
              : "Contribution growth rate (per year)") +
            " \u2014 drives annual contribution increase"
          }
          value={draft.personal.salaryGrowthRate ?? draft.investment.contributionGrowthRate}
          min={0}
          max={0.1}
          step={0.005}
          displayValue={
            (
              (draft.personal.salaryGrowthRate ?? draft.investment.contributionGrowthRate) * 100
            ).toFixed(1) + "%"
          }
          onChange={(v) => {
            if (draft.personal.currentAnnualSalary) {
              updatePersonal("salaryGrowthRate", v);
            } else {
              updateInvestment("contributionGrowthRate", v);
            }
          }}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            label={`Net annual salary / take-home (${draft.currency}) \u2014 optional`}
            value={draft.personal.currentAnnualSalary ?? 0}
            onChange={(v) =>
              updatePersonal("currentAnnualSalary", v > 0 ? v : (undefined as unknown as number))
            }
            min={0}
          />
        </div>
        {(draft.personal.currentAnnualSalary ?? 0) > 0 && (
          <p className="text-muted-foreground text-xs">
            Implied savings rate:{" "}
            <span className="text-foreground font-medium">
              {(
                ((draft.investment.monthlyContribution * 12) /
                  draft.personal.currentAnnualSalary!) *
                100
              ).toFixed(1)}
              %
            </span>{" "}
            of net salary (take-home)
          </p>
        )}

        {/* Glide Path */}
        <div className="border-border space-y-3 rounded border p-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs font-semibold">Glide Path (Bond Shift)</Label>
              <p className="text-muted-foreground mt-1 text-xs">
                Gradually shift from equities to bonds during retirement to reduce
                sequence-of-returns risk.
              </p>
            </div>
            <Switch
              checked={draft.investment.glidePath?.enabled ?? false}
              onCheckedChange={(v) =>
                updateInvestment(
                  "glidePath",
                  v
                    ? {
                        enabled: true,
                        bondReturnRate: draft.investment.glidePath?.bondReturnRate ?? 0.03,
                        bondAllocationAtFire:
                          draft.investment.glidePath?.bondAllocationAtFire ?? 0.2,
                        bondAllocationAtHorizon:
                          draft.investment.glidePath?.bondAllocationAtHorizon ?? 0.5,
                      }
                    : {
                        ...(draft.investment.glidePath ?? {
                          bondReturnRate: 0.03,
                          bondAllocationAtFire: 0.2,
                          bondAllocationAtHorizon: 0.5,
                        }),
                        enabled: false,
                      },
                )
              }
            />
          </div>
          {draft.investment.glidePath?.enabled && (
            <div className="space-y-4">
              <SliderField
                label="Bond return rate"
                value={draft.investment.glidePath.bondReturnRate}
                min={0.01}
                max={0.06}
                step={0.0025}
                displayValue={(draft.investment.glidePath.bondReturnRate * 100).toFixed(2) + "%"}
                onChange={(v) =>
                  updateInvestment("glidePath", {
                    ...draft.investment.glidePath!,
                    bondReturnRate: v,
                  })
                }
              />
              <SliderField
                label="Bond allocation at retirement date"
                value={draft.investment.glidePath.bondAllocationAtFire}
                min={0}
                max={0.6}
                step={0.05}
                displayValue={
                  (draft.investment.glidePath.bondAllocationAtFire * 100).toFixed(0) + "%"
                }
                onChange={(v) =>
                  updateInvestment("glidePath", {
                    ...draft.investment.glidePath!,
                    bondAllocationAtFire: v,
                  })
                }
              />
              <SliderField
                label="Bond allocation at planning horizon"
                value={draft.investment.glidePath.bondAllocationAtHorizon}
                min={0}
                max={0.9}
                step={0.05}
                displayValue={
                  (draft.investment.glidePath.bondAllocationAtHorizon * 100).toFixed(0) + "%"
                }
                onChange={(v) =>
                  updateInvestment("glidePath", {
                    ...draft.investment.glidePath!,
                    bondAllocationAtHorizon: v,
                  })
                }
              />
              <p className="text-muted-foreground text-xs">
                The portfolio shifts linearly from{" "}
                {(draft.investment.glidePath.bondAllocationAtFire * 100).toFixed(0)}% bonds at
                retirement to{" "}
                {(draft.investment.glidePath.bondAllocationAtHorizon * 100).toFixed(0)}% bonds at
                age {draft.personal.planningHorizonAge}. Equity allocation ={" "}
                {((1 - draft.investment.glidePath.bondAllocationAtFire) * 100).toFixed(0)}%{" "}
                {"\u2192"}{" "}
                {((1 - draft.investment.glidePath.bondAllocationAtHorizon) * 100).toFixed(0)}%.
              </p>
            </div>
          )}
        </div>
      </SettingsSection>

      {/* ── Section 5: Withdrawal Rule ── */}
      <SettingsSection title="Retirement Withdrawal Rule" defaultOpen={true}>
        <div className="space-y-2">
          <Label className="text-xs">Strategy</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            {(["constant-dollar", "constant-percentage", "guardrails"] as const).map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="withdrawalStrategy"
                  value={s}
                  checked={draft.withdrawal.strategy === s}
                  onChange={() => updateWithdrawal("strategy", s)}
                />
                {s === "constant-dollar"
                  ? "Constant dollar (fixed real spending)"
                  : s === "constant-percentage"
                    ? "Constant percentage (% of portfolio)"
                    : "Guardrails (dynamic ceiling/floor)"}
              </label>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            {draft.withdrawal.strategy === "constant-dollar"
              ? "Withdraw a fixed inflation-adjusted amount each year. Spending is stable but the portfolio can deplete."
              : draft.withdrawal.strategy === "constant-percentage"
                ? `Withdraw ${(draft.withdrawal.safeWithdrawalRate * 100).toFixed(1)}% of the portfolio each year. Income varies with market performance; the portfolio never fully depletes.`
                : "Withdraw a percentage that adjusts within ceiling/floor bands. Smooths spending while protecting the portfolio."}
          </p>
          {draft.withdrawal.strategy === "guardrails" && (
            <div className="ml-6 space-y-2 border-l pl-4">
              <SliderField
                label="Ceiling rate"
                value={draft.withdrawal.guardrails?.ceilingRate ?? 0.06}
                min={0.03}
                max={0.1}
                step={0.005}
                displayValue={
                  ((draft.withdrawal.guardrails?.ceilingRate ?? 0.06) * 100).toFixed(1) + "%"
                }
                onChange={(v) =>
                  updateWithdrawal("guardrails", {
                    ceilingRate: v,
                    floorRate: draft.withdrawal.guardrails?.floorRate ?? 0.03,
                  })
                }
              />
              <SliderField
                label="Floor rate"
                value={draft.withdrawal.guardrails?.floorRate ?? 0.03}
                min={0.01}
                max={0.06}
                step={0.005}
                displayValue={
                  ((draft.withdrawal.guardrails?.floorRate ?? 0.03) * 100).toFixed(1) + "%"
                }
                onChange={(v) =>
                  updateWithdrawal("guardrails", {
                    ceilingRate: draft.withdrawal.guardrails?.ceilingRate ?? 0.06,
                    floorRate: v,
                  })
                }
              />
            </div>
          )}
        </div>
      </SettingsSection>

      {/* ── Section 6: Withdrawal Taxes ── */}
      <SettingsSection title="Withdrawal Taxes" defaultOpen={false}>
        <p className="text-muted-foreground mb-3 text-xs">
          Simple effective tax rates applied when retirement spending is funded from each account
          bucket. Set all rates to 0% to ignore tax drag.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <SliderField
            label="Taxable account rate"
            value={(draft.tax?.taxableWithdrawalRate ?? 0) * 100}
            min={0}
            max={50}
            step={0.5}
            displayValue={((draft.tax?.taxableWithdrawalRate ?? 0) * 100).toFixed(1) + "%"}
            onChange={(v) => updateTax("taxableWithdrawalRate", v / 100)}
          />
          <SliderField
            label="Tax-deferred account rate"
            value={(draft.tax?.taxDeferredWithdrawalRate ?? 0) * 100}
            min={0}
            max={50}
            step={0.5}
            displayValue={((draft.tax?.taxDeferredWithdrawalRate ?? 0) * 100).toFixed(1) + "%"}
            onChange={(v) => updateTax("taxDeferredWithdrawalRate", v / 100)}
          />
          <SliderField
            label="Tax-free account rate"
            value={(draft.tax?.taxFreeWithdrawalRate ?? 0) * 100}
            min={0}
            max={50}
            step={0.5}
            displayValue={((draft.tax?.taxFreeWithdrawalRate ?? 0) * 100).toFixed(1) + "%"}
            onChange={(v) => updateTax("taxFreeWithdrawalRate", v / 100)}
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <SliderField
            label="Early withdrawal penalty"
            value={(draft.tax?.earlyWithdrawalPenaltyRate ?? 0) * 100}
            min={0}
            max={20}
            step={0.5}
            displayValue={((draft.tax?.earlyWithdrawalPenaltyRate ?? 0) * 100).toFixed(1) + "%"}
            onChange={(v) => updateTax("earlyWithdrawalPenaltyRate", v / 100)}
          />
          <NumberField
            label="Penalty cutoff age"
            value={draft.tax?.earlyWithdrawalPenaltyAge ?? 59}
            onChange={(v) => updateTax("earlyWithdrawalPenaltyAge", v)}
          />
        </div>
      </SettingsSection>

      {/* ── Section 7: Advanced ── */}
      <SettingsSection title="Advanced" defaultOpen={false}>
        {/* Auto-configure from portfolio */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm">Auto-configure from portfolio</CardTitle>
              <p className="text-muted-foreground mt-1 text-xs">
                Detect monthly contribution, before-retirement return, and target allocations from
                your portfolio data.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoConfig}
              disabled={autoConfigLoading}
            >
              {autoConfigLoading ? "Analyzing\u2026" : "Detect from portfolio"}
            </Button>
          </CardHeader>

          {autoConfigResult && (
            <CardContent className="space-y-3">
              <div className="space-y-2 rounded border p-3 text-xs">
                {autoConfigResult.monthlyContribution !== null && (
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="font-medium">Monthly contribution</span>
                      <p className="text-muted-foreground">
                        {autoConfigResult.notes.monthlyContribution}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold text-green-600">
                      {autoConfigResult.monthlyContribution.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}{" "}
                      {draft.currency}
                    </span>
                  </div>
                )}
                {autoConfigResult.preRetirementAnnualReturn !== null && (
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="font-medium">Return before retirement</span>
                      <p className="text-muted-foreground">
                        {autoConfigResult.notes.preRetirementAnnualReturn}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold text-green-600">
                      {(autoConfigResult.preRetirementAnnualReturn * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
                {autoConfigResult.retirementAnnualReturn !== null && (
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="font-medium">Return during retirement</span>
                      <p className="text-muted-foreground">
                        {autoConfigResult.notes.retirementAnnualReturn}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold text-green-600">
                      {(autoConfigResult.retirementAnnualReturn * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
                {autoConfigResult.annualInvestmentFeeRate !== null && (
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="font-medium">Annual investment fee</span>
                      <p className="text-muted-foreground">
                        {autoConfigResult.notes.annualInvestmentFeeRate}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold text-green-600">
                      {(autoConfigResult.annualInvestmentFeeRate * 100).toFixed(2)}%
                    </span>
                  </div>
                )}
                {autoConfigResult.targetAllocations !== null && (
                  <div>
                    <span className="font-medium">Target allocations</span>
                    <p className="text-muted-foreground">
                      {autoConfigResult.notes.targetAllocations}
                    </p>
                    <p className="mt-1">
                      {Object.entries(autoConfigResult.targetAllocations)
                        .map(([sym, w]) => `${sym} ${(w * 100).toFixed(1)}%`)
                        .join(" \u00b7 ")}
                    </p>
                  </div>
                )}
                {autoConfigResult.monthlyContribution === null &&
                  autoConfigResult.preRetirementAnnualReturn === null &&
                  autoConfigResult.retirementAnnualReturn === null &&
                  autoConfigResult.annualInvestmentFeeRate === null &&
                  autoConfigResult.targetAllocations === null && (
                    <p className="text-muted-foreground">
                      No data could be detected. Add activities and holdings to Wealthfolio first.
                    </p>
                  )}
              </div>
              {(autoConfigResult.monthlyContribution !== null ||
                autoConfigResult.preRetirementAnnualReturn !== null ||
                autoConfigResult.retirementAnnualReturn !== null ||
                autoConfigResult.annualInvestmentFeeRate !== null ||
                autoConfigResult.targetAllocations !== null) && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={applyDetected}>
                    Apply detected values
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setAutoConfigResult(null)}>
                    Dismiss
                  </Button>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Target Allocations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm">Target Allocations</CardTitle>
              {allocEntries.length > 0 && (
                <p
                  className={`mt-1 text-xs ${allocWarning ? "text-red-500" : "text-muted-foreground"}`}
                >
                  Total: {(totalAllocPct * 100).toFixed(1)}%
                  {allocWarning && " \u2014 must equal 100%"}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {holdings.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={autoDetectAllocations}
                >
                  Auto-detect from holdings
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={addAllocation}>
                + Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {allocEntries.length === 0 && (
              <p className="text-muted-foreground text-xs">
                Add target weights to enable drift monitoring in the Allocation tab.
              </p>
            )}
            {allocEntries.map(([sym, weight]) => (
              <div key={sym} className="flex items-center gap-2">
                <Input
                  value={sym}
                  placeholder="Ticker / symbol"
                  className="h-8 flex-1 text-sm"
                  onChange={(e) => updateAllocation(sym, e.target.value, weight)}
                />
                <Input
                  type="number"
                  value={Math.round(weight * 1000) / 10}
                  min={0}
                  max={100}
                  step={0.1}
                  className="h-8 w-24 text-sm"
                  onChange={(e) =>
                    updateAllocation(sym, sym, (parseFloat(e.target.value) || 0) / 100)
                  }
                />
                <span className="text-muted-foreground text-xs">%</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-red-500 hover:text-red-600"
                  onClick={() => removeAllocation(sym)}
                >
                  {"\u00d7"}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Reset to defaults */}
        <div>
          {showResetConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">Reset all settings to defaults?</span>
              <Button variant="destructive" size="sm" onClick={handleReset}>
                Yes, reset
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground text-xs"
              onClick={() => setShowResetConfirm(true)}
            >
              Reset to defaults
            </Button>
          )}
        </div>
      </SettingsSection>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving\u2026" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
