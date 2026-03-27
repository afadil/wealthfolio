import type { AddonContext, Holding, ActivityDetails, Account } from "@wealthfolio/addon-sdk";
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
import { useState, useEffect } from "react";
import type { FireSettings, IncomeStream } from "../types";
import { DEFAULT_SETTINGS } from "../lib/storage";
import { runAutoConfig, applyAutoConfig, type AutoConfigResult } from "../lib/auto-config";

interface Props {
  ctx: AddonContext;
  settings: FireSettings;
  onSave: (settings: FireSettings) => void;
  isSaving: boolean;
  holdings: Holding[];
  activities: ActivityDetails[];
  accounts: Account[];
}

function generateId() {
  return Math.random().toString(36).slice(2, 9);
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
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-muted-foreground text-xs">{prefix}</span>}
        <Input
          type="number"
          value={value}
          min={min}
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

export default function SettingsPage({
  ctx,
  settings,
  onSave,
  isSaving,
  holdings,
  activities,
  accounts,
}: Props) {
  const [draft, setDraft] = useState<FireSettings>(settings);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [autoConfigResult, setAutoConfigResult] = useState<AutoConfigResult | null>(null);
  const [autoConfigLoading, setAutoConfigLoading] = useState(false);
  const [syncingStreamId, setSyncingStreamId] = useState<string | null>(null);

  // Sync when settings load from storage
  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  async function handleAutoConfig() {
    setAutoConfigLoading(true);
    setAutoConfigResult(null);
    try {
      const result = await runAutoConfig(activities, holdings, accounts, ctx);
      setAutoConfigResult(result);
    } catch (e) {
      ctx.api.toast.error("Auto-config failed: " + (e as Error).message);
    } finally {
      setAutoConfigLoading(false);
    }
  }

  function applyDetected() {
    if (!autoConfigResult) return;
    setDraft((prev) => applyAutoConfig(prev, autoConfigResult));
    setAutoConfigResult(null);
    ctx.api.toast.success("Auto-config applied — review and save when ready.");
  }

  function update<K extends keyof FireSettings>(key: K, value: FireSettings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  // ─── Income streams ──────────────────────────────────────────────────────────

  function addStream() {
    update("additionalIncomeStreams", [
      ...draft.additionalIncomeStreams,
      {
        id: generateId(),
        label: "",
        monthlyAmount: 0,
        startAge: draft.targetFireAge,
        adjustForInflation: false,
      },
    ]);
  }

  function updateStream(id: string, patch: Partial<IncomeStream>) {
    update(
      "additionalIncomeStreams",
      draft.additionalIncomeStreams.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }

  async function syncStreamFromAccount(streamId: string, accountId: string) {
    setSyncingStreamId(streamId);
    try {
      const valuations = await ctx.api.portfolio.getLatestValuations([accountId]);
      const v = valuations?.[0];
      if (v) {
        const value = Math.round(v.totalValue * v.fxRateToBase);
        updateStream(streamId, { currentValue: value });
        ctx.api.toast.success(`Synced: ${value.toLocaleString()} ${draft.currency}`);
      } else {
        ctx.api.toast.error("No valuation found for this account.");
      }
    } catch {
      ctx.api.toast.error("Sync failed.");
    } finally {
      setSyncingStreamId(null);
    }
  }

  function removeStream(id: string) {
    update(
      "additionalIncomeStreams",
      draft.additionalIncomeStreams.filter((s) => s.id !== id),
    );
  }

  // ─── Target allocations ──────────────────────────────────────────────────────

  const allocEntries = Object.entries(draft.targetAllocations);
  const totalAllocPct = allocEntries.reduce((sum, [, w]) => sum + w, 0);
  const allocDiff = Math.abs(totalAllocPct - 1);
  const allocWarning = allocEntries.length > 0 && allocDiff > 0.01;

  function addAllocation() {
    update("targetAllocations", { ...draft.targetAllocations, "": 0 });
  }

  function updateAllocation(oldKey: string, newKey: string, weight: number) {
    const next = { ...draft.targetAllocations };
    if (oldKey !== newKey) delete next[oldKey];
    next[newKey] = weight;
    update("targetAllocations", next);
  }

  function removeAllocation(key: string) {
    const next = { ...draft.targetAllocations };
    delete next[key];
    update("targetAllocations", next);
  }

  // Auto-detect from buy activities (approximate from holdings)
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
    update("targetAllocations", allocs);
  }

  function handleReset() {
    setDraft({ ...DEFAULT_SETTINGS, currency: draft.currency });
    setShowResetConfirm(false);
  }

  function handleSave() {
    // Resolve auto payout ages: startAgeIsAuto streams always use targetFireAge
    const resolved: FireSettings = {
      ...draft,
      additionalIncomeStreams: draft.additionalIncomeStreams.map((s) =>
        s.startAgeIsAuto ? { ...s, startAge: draft.targetFireAge } : s,
      ),
    };
    onSave(resolved);
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Auto-configure from portfolio */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-sm">Auto-configure from portfolio</CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              Detect monthly contribution, expected return, and target allocations from your
              portfolio data.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAutoConfig}
            disabled={autoConfigLoading}
          >
            {autoConfigLoading ? "Analyzing…" : "Detect from portfolio"}
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
                    {autoConfigResult.currency ?? draft.currency}
                  </span>
                </div>
              )}
              {autoConfigResult.expectedAnnualReturn !== null && (
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="font-medium">Expected annual return</span>
                    <p className="text-muted-foreground">
                      {autoConfigResult.notes.expectedAnnualReturn}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold text-green-600">
                    {(autoConfigResult.expectedAnnualReturn * 100).toFixed(1)}%
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
                      .join(" · ")}
                  </p>
                </div>
              )}
              {autoConfigResult.monthlyContribution === null &&
                autoConfigResult.expectedAnnualReturn === null &&
                autoConfigResult.targetAllocations === null && (
                  <p className="text-muted-foreground">
                    No data could be detected. Add activities and holdings to Wealthfolio first.
                  </p>
                )}
            </div>
            {(autoConfigResult.monthlyContribution !== null ||
              autoConfigResult.expectedAnnualReturn !== null ||
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

      {/* FIRE Parameters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">FIRE Parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField
              label={`Monthly expenses in FIRE (${draft.currency})`}
              value={draft.monthlyExpensesAtFire}
              onChange={(v) => update("monthlyExpensesAtFire", v)}
              min={0}
            />
            <NumberField
              label="Current age"
              value={draft.currentAge}
              onChange={(v) => update("currentAge", v)}
              min={1}
            />
            <NumberField
              label="Target FIRE age"
              value={draft.targetFireAge}
              onChange={(v) => update("targetFireAge", v)}
              min={1}
            />
            <NumberField
              label="Planning horizon age (life expectancy)"
              value={draft.planningHorizonAge}
              onChange={(v) => update("planningHorizonAge", v)}
              min={draft.targetFireAge + 1}
            />
          </div>
          <SliderField
            label="Safe Withdrawal Rate"
            value={draft.safeWithdrawalRate}
            min={0.025}
            max={0.06}
            step={0.0025}
            displayValue={(draft.safeWithdrawalRate * 100).toFixed(2) + "%"}
            onChange={(v) => update("safeWithdrawalRate", v)}
          />
          <div className="space-y-2">
            <Label className="text-xs">Withdrawal Strategy</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
              {(["constant-dollar", "constant-percentage"] as const).map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="withdrawalStrategy"
                    value={s}
                    checked={(draft.withdrawalStrategy ?? "constant-dollar") === s}
                    onChange={() => update("withdrawalStrategy", s)}
                  />
                  {s === "constant-dollar"
                    ? "Constant dollar (fixed real spending)"
                    : "Constant percentage (% of portfolio)"}
                </label>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              {(draft.withdrawalStrategy ?? "constant-dollar") === "constant-dollar"
                ? "Withdraw a fixed inflation-adjusted amount each year. Spending is stable but the portfolio can deplete."
                : `Withdraw ${(draft.safeWithdrawalRate * 100).toFixed(1)}% of the portfolio each year. Spending varies with market performance; the portfolio never fully depletes.`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Investment Parameters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Investment Parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField
              label={`Monthly contribution (${draft.currency})`}
              value={draft.monthlyContribution}
              onChange={(v) => update("monthlyContribution", v)}
              min={0}
            />
            <NumberField
              label={`Net annual salary / take-home (${draft.currency}) — optional`}
              value={draft.currentAnnualSalary ?? 0}
              onChange={(v) =>
                update("currentAnnualSalary", v > 0 ? v : (undefined as unknown as number))
              }
              min={0}
            />
          </div>
          {(draft.currentAnnualSalary ?? 0) > 0 && (
            <p className="text-muted-foreground text-xs">
              Implied savings rate:{" "}
              <span className="text-foreground font-medium">
                {(((draft.monthlyContribution * 12) / draft.currentAnnualSalary!) * 100).toFixed(1)}
                %
              </span>{" "}
              of net salary (take-home)
            </p>
          )}
          <SliderField
            label={
              (draft.salaryGrowthRate !== undefined
                ? "Salary growth rate (per year)"
                : "Contribution growth rate (per year)") + " — drives annual contribution increase"
            }
            value={draft.salaryGrowthRate ?? draft.contributionGrowthRate}
            min={0}
            max={0.1}
            step={0.005}
            displayValue={
              ((draft.salaryGrowthRate ?? draft.contributionGrowthRate) * 100).toFixed(1) + "%"
            }
            onChange={(v) => {
              if (draft.currentAnnualSalary) {
                update("salaryGrowthRate", v);
              } else {
                update("contributionGrowthRate", v);
              }
            }}
          />
          {draft.currentAnnualSalary && (
            <p className="text-muted-foreground text-xs">
              Salary growth rate is active — your monthly contribution will grow at this rate each
              year, mirroring salary raises.
            </p>
          )}
          <SliderField
            label="Expected annual portfolio return"
            value={draft.expectedAnnualReturn}
            min={0.03}
            max={0.12}
            step={0.005}
            displayValue={(draft.expectedAnnualReturn * 100).toFixed(1) + "%"}
            onChange={(v) => update("expectedAnnualReturn", v)}
          />
          <SliderField
            label="Return standard deviation (volatility)"
            value={draft.expectedReturnStdDev}
            min={0.05}
            max={0.25}
            step={0.005}
            displayValue={(draft.expectedReturnStdDev * 100).toFixed(1) + "%"}
            onChange={(v) => update("expectedReturnStdDev", v)}
          />
          <p className="text-muted-foreground text-xs">
            Volatility is used only for Monte Carlo simulation. Higher values produce a wider fan of
            outcomes.
          </p>
          <SliderField
            label="Inflation rate"
            value={draft.inflationRate}
            min={0.01}
            max={0.05}
            step={0.0025}
            displayValue={(draft.inflationRate * 100).toFixed(2) + "%"}
            onChange={(v) => update("inflationRate", v)}
          />
        </CardContent>
      </Card>

      {/* Portfolio Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Portfolio Accounts</CardTitle>
          <p className="text-muted-foreground mt-1 text-xs">
            Choose which accounts count toward your FIRE portfolio. Cash / bank accounts are
            excluded by default.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {accounts.filter((a) => a.isActive && !a.isArchived).length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No active accounts found in Wealthfolio.
            </p>
          ) : (
            accounts
              .filter((a) => a.isActive && !a.isArchived)
              .map((a) => {
                const isInvestment =
                  a.accountType === "SECURITIES" || a.accountType === "CRYPTOCURRENCY";
                // If includedAccountIds is not set, default selection = investment accounts
                const included =
                  draft.includedAccountIds != null
                    ? draft.includedAccountIds.includes(a.id)
                    : isInvestment;
                return (
                  <div key={a.id} className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      id={`acc-${a.id}`}
                      checked={included}
                      onChange={(e) => {
                        // Materialise the selection list from the current effective set
                        const currentSet =
                          draft.includedAccountIds ??
                          accounts
                            .filter(
                              (x) =>
                                x.isActive &&
                                !x.isArchived &&
                                (x.accountType === "SECURITIES" ||
                                  x.accountType === "CRYPTOCURRENCY"),
                            )
                            .map((x) => x.id);
                        const next = e.target.checked
                          ? [...currentSet, a.id]
                          : currentSet.filter((id) => id !== a.id);
                        update("includedAccountIds", next.length > 0 ? next : []);
                      }}
                    />
                    <label htmlFor={`acc-${a.id}`} className="flex-1 cursor-pointer">
                      {a.name}
                    </label>
                    <span className="text-muted-foreground text-xs">{a.accountType}</span>
                  </div>
                );
              })
          )}
        </CardContent>
      </Card>

      {/* Additional Income Streams */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Additional Income Streams</CardTitle>
          <Button variant="outline" size="sm" onClick={addStream}>
            + Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.additionalIncomeStreams.length === 0 && (
            <p className="text-muted-foreground text-xs">
              No income streams added. Examples: state pension, rental income, part-time work. Enter
              amounts as net (after tax).
            </p>
          )}
          {draft.additionalIncomeStreams.map((stream) => {
            const hasPension =
              (stream.currentValue ?? 0) > 0 ||
              (stream.monthlyContribution ?? 0) > 0 ||
              (stream.accumulationReturn ?? 0) > 0;
            return (
              <div key={stream.id} className="rounded border p-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div className="col-span-2 sm:col-span-1">
                    <Label className="text-xs">Label</Label>
                    <Input
                      value={stream.label}
                      onChange={(e) => updateStream(stream.id, { label: e.target.value })}
                      placeholder="e.g. State Pension"
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">
                      Monthly amount — today's {draft.currency} (real)
                    </Label>
                    <Input
                      type="number"
                      value={stream.monthlyAmount}
                      min={0}
                      onChange={(e) =>
                        updateStream(stream.id, { monthlyAmount: parseFloat(e.target.value) || 0 })
                      }
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs">Payout start age</Label>
                      <label className="text-muted-foreground flex cursor-pointer items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={stream.startAgeIsAuto ?? false}
                          onChange={(e) =>
                            updateStream(stream.id, { startAgeIsAuto: e.target.checked })
                          }
                        />
                        Auto
                      </label>
                    </div>
                    {stream.startAgeIsAuto ? (
                      <p className="mt-1 flex h-8 items-center text-sm font-medium">
                        {draft.targetFireAge}
                        <span className="text-muted-foreground ml-1 text-xs">(= FIRE age)</span>
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
                  <div className="flex flex-col items-start gap-1">
                    <Label className="text-xs">Inflation-adjusted</Label>
                    <Switch
                      checked={stream.annualGrowthRate === undefined && stream.adjustForInflation}
                      disabled={stream.annualGrowthRate !== undefined}
                      onCheckedChange={(v) => updateStream(stream.id, { adjustForInflation: v })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">
                      Custom growth rate (%/yr){" "}
                      <span className="text-muted-foreground">— overrides inflation flag</span>
                    </Label>
                    <div className="mt-1 flex items-center gap-1">
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

                {/* Pension fund accumulation toggle */}
                <div className="mt-3 flex items-center gap-2">
                  <Switch
                    checked={hasPension}
                    onCheckedChange={(v) => {
                      if (v) {
                        updateStream(stream.id, {
                          currentValue: 0,
                          monthlyContribution: 0,
                          accumulationReturn: 0.04,
                          startAgeIsAuto: true,
                        });
                      } else {
                        updateStream(stream.id, {
                          currentValue: undefined,
                          monthlyContribution: undefined,
                          accumulationReturn: undefined,
                        });
                      }
                    }}
                  />
                  <Label className="text-muted-foreground cursor-pointer text-xs">
                    Has accumulation fund (pension fund, TFR…)
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
                    {/* Account link */}
                    <div className="col-span-full space-y-1">
                      <Label className="text-xs">
                        Link to Wealthfolio account{" "}
                        <span className="text-muted-foreground">
                          (optional — syncs current value)
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
                          <option value="">— Not linked —</option>
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
                            onClick={() =>
                              syncStreamFromAccount(stream.id, stream.linkedAccountId!)
                            }
                          >
                            {syncingStreamId === stream.id ? "Syncing…" : "Sync value"}
                          </Button>
                        )}
                      </div>
                      {stream.linkedAccountId && (
                        <p className="text-muted-foreground text-xs">
                          Current value pulled from this account. Click "Sync value" to refresh from
                          live data.
                        </p>
                      )}
                    </div>

                    <p className="text-muted-foreground col-span-full text-xs">
                      Phase 1 (now → FIRE): fund grows with contributions + investment return. Phase
                      2 (FIRE → payout age): contributions stop (no more TFR), fund keeps growing on
                      return only. Phase 3 (payout age+): pays out as monthly income.
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
        </CardContent>
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
                Total: {(totalAllocPct * 100).toFixed(1)}%{allocWarning && " — must equal 100%"}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {holdings.length > 0 && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={autoDetectAllocations}>
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
                ×
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between">
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
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
