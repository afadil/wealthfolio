import type { Account, ActivityDetails, Holding } from "@/lib/types";
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
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { FireSettings, IncomeStream } from "../types";
import { DEFAULT_SETTINGS } from "../lib/storage";
import { runAutoConfig, applyAutoConfig, type AutoConfigResult } from "../lib/auto-config";

interface Props {
  settings: FireSettings;
  onSave: (settings: FireSettings) => void | Promise<void>;
  isSaving: boolean;
  holdings: Holding[];
  activities: ActivityDetails[];
  accounts: Account[];
  /** Accounts already filtered to the FIRE scope — used for auto-config expected return. */
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
  settings,
  onSave,
  isSaving,
  holdings,
  activities,
  accounts,
  activeAccounts,
}: Props) {
  const { t } = useTranslation("common");
  const [draft, setDraft] = useState<FireSettings>(settings);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [autoConfigResult, setAutoConfigResult] = useState<AutoConfigResult | null>(null);
  const [autoConfigLoading, setAutoConfigLoading] = useState(false);
  const [syncingStreamId, setSyncingStreamId] = useState<string | null>(null);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  async function handleAutoConfig() {
    setAutoConfigLoading(true);
    setAutoConfigResult(null);
    try {
      const result = await runAutoConfig(activities, holdings, activeAccounts);
      setAutoConfigResult(result);
    } catch (e) {
      toast({
        title: t("fire.settings.toast_auto_config_failed"),
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
    toast({ title: t("fire.settings.toast_auto_config_applied") });
  }

  function update<K extends keyof FireSettings>(key: K, value: FireSettings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

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
      const valuations = await getLatestValuations([accountId]);
      const v = valuations?.[0];
      if (v) {
        const value = Math.round(v.totalValue * v.fxRateToBase);
        updateStream(streamId, { currentValue: value });
        toast({
          title: t("fire.settings.toast_synced", {
            value: value.toLocaleString(),
            currency: draft.currency,
          }),
        });
      } else {
        toast({ title: t("fire.settings.toast_no_valuation"), variant: "destructive" });
      }
    } catch {
      toast({ title: t("fire.settings.toast_sync_failed"), variant: "destructive" });
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

  async function handleSave() {
    const resolved: FireSettings = {
      ...draft,
      additionalIncomeStreams: draft.additionalIncomeStreams.map((s) =>
        s.startAgeIsAuto ? { ...s, startAge: draft.targetFireAge } : s,
      ),
    };
    await onSave(resolved);
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Auto-configure from portfolio */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-sm">{t("fire.settings.auto_config_title")}</CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              {t("fire.settings.auto_config_description")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAutoConfig}
            disabled={autoConfigLoading}
          >
            {autoConfigLoading
              ? t("fire.settings.auto_config_analyzing")
              : t("fire.settings.auto_config_detect")}
          </Button>
        </CardHeader>

        {autoConfigResult && (
          <CardContent className="space-y-3">
            <div className="space-y-2 rounded border p-3 text-xs">
              {autoConfigResult.monthlyContribution !== null && (
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="font-medium">{t("fire.settings.auto_monthly_contribution")}</span>
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
              {autoConfigResult.expectedAnnualReturn !== null && (
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="font-medium">{t("fire.settings.auto_expected_return")}</span>
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
                  <span className="font-medium">{t("fire.settings.auto_target_allocations")}</span>
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
                  <p className="text-muted-foreground">{t("fire.settings.auto_none_detected")}</p>
                )}
            </div>
            {(autoConfigResult.monthlyContribution !== null ||
              autoConfigResult.expectedAnnualReturn !== null ||
              autoConfigResult.targetAllocations !== null) && (
              <div className="flex gap-2">
                <Button size="sm" onClick={applyDetected}>
                  {t("fire.settings.auto_apply")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setAutoConfigResult(null)}>
                  {t("fire.settings.auto_dismiss")}
                </Button>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* FIRE Parameters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("fire.settings.params_title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField
              label={t("fire.settings.monthly_expenses_label", { currency: draft.currency })}
              value={draft.monthlyExpensesAtFire}
              onChange={(v) => update("monthlyExpensesAtFire", v)}
              min={0}
            />
            <NumberField
              label={t("fire.settings.current_age")}
              value={draft.currentAge}
              onChange={(v) => update("currentAge", v)}
              min={1}
            />
            <NumberField
              label={t("fire.settings.target_fire_age")}
              value={draft.targetFireAge}
              onChange={(v) => update("targetFireAge", v)}
              min={1}
            />
            <NumberField
              label={t("fire.settings.planning_horizon_age")}
              value={draft.planningHorizonAge}
              onChange={(v) => update("planningHorizonAge", v)}
              min={draft.targetFireAge + 1}
            />
          </div>
          <SliderField
            label={t("fire.settings.swr_label")}
            value={draft.safeWithdrawalRate}
            min={0.025}
            max={0.06}
            step={0.0025}
            displayValue={(draft.safeWithdrawalRate * 100).toFixed(2) + "%"}
            onChange={(v) => update("safeWithdrawalRate", v)}
          />
          <div className="space-y-2">
            <Label className="text-xs">{t("fire.settings.withdrawal_strategy")}</Label>
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
                    ? t("fire.settings.withdrawal_constant_dollar")
                    : t("fire.settings.withdrawal_constant_pct")}
                </label>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              {(draft.withdrawalStrategy ?? "constant-dollar") === "constant-dollar"
                ? t("fire.settings.withdrawal_help_dollar")
                : t("fire.settings.withdrawal_help_pct", {
                    pct: (draft.safeWithdrawalRate * 100).toFixed(1),
                  })}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Healthcare Costs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("fire.settings.healthcare_title")}</CardTitle>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("fire.settings.healthcare_description")}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <NumberField
            label={t("fire.settings.healthcare_monthly_label", { currency: draft.currency })}
            value={draft.healthcareMonthlyAtFire ?? 0}
            onChange={(v) => update("healthcareMonthlyAtFire", v > 0 ? v : undefined)}
            min={0}
          />
          {(draft.healthcareMonthlyAtFire ?? 0) > 0 && (
            <SliderField
              label={t("fire.settings.healthcare_inflation_label")}
              value={draft.healthcareInflationRate ?? draft.inflationRate}
              min={0.01}
              max={0.08}
              step={0.0025}
              displayValue={
                ((draft.healthcareInflationRate ?? draft.inflationRate) * 100).toFixed(2) + "%"
              }
              onChange={(v) => update("healthcareInflationRate", v)}
            />
          )}
        </CardContent>
      </Card>

      {/* Investment Parameters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("fire.settings.investment_title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField
              label={t("fire.settings.monthly_contribution_label", { currency: draft.currency })}
              value={draft.monthlyContribution}
              onChange={(v) => update("monthlyContribution", v)}
              min={0}
            />
            <NumberField
              label={t("fire.settings.net_salary_label", { currency: draft.currency })}
              value={draft.currentAnnualSalary ?? 0}
              onChange={(v) =>
                update("currentAnnualSalary", v > 0 ? v : (undefined as unknown as number))
              }
              min={0}
            />
          </div>
          {(draft.currentAnnualSalary ?? 0) > 0 && (
            <p className="text-muted-foreground text-xs">
              {t("fire.settings.implied_savings_rate")}{" "}
              <span className="text-foreground font-medium">
                {(((draft.monthlyContribution * 12) / draft.currentAnnualSalary!) * 100).toFixed(1)}
                %
              </span>{" "}
              {t("fire.settings.implied_savings_suffix")}
            </p>
          )}
          <SliderField
            label={
              draft.salaryGrowthRate !== undefined
                ? t("fire.settings.salary_growth_label")
                : t("fire.settings.contribution_growth_label")
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
          <SliderField
            label={t("fire.settings.expected_return_label")}
            value={draft.expectedAnnualReturn}
            min={0.03}
            max={0.12}
            step={0.005}
            displayValue={(draft.expectedAnnualReturn * 100).toFixed(1) + "%"}
            onChange={(v) => update("expectedAnnualReturn", v)}
          />
          <SliderField
            label={t("fire.settings.return_stddev_label")}
            value={draft.expectedReturnStdDev}
            min={0.05}
            max={0.25}
            step={0.005}
            displayValue={(draft.expectedReturnStdDev * 100).toFixed(1) + "%"}
            onChange={(v) => update("expectedReturnStdDev", v)}
          />
          <p className="text-muted-foreground text-xs">{t("fire.settings.volatility_help")}</p>
          <SliderField
            label={t("fire.settings.inflation_rate_label")}
            value={draft.inflationRate}
            min={0.01}
            max={0.05}
            step={0.0025}
            displayValue={(draft.inflationRate * 100).toFixed(2) + "%"}
            onChange={(v) => update("inflationRate", v)}
          />
        </CardContent>
      </Card>

      {/* Glide Path */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">{t("fire.settings.glide_title")}</CardTitle>
              <p className="text-muted-foreground mt-1 text-xs">
                {t("fire.settings.glide_description")}
              </p>
            </div>
            <Switch
              checked={draft.glidePath?.enabled ?? false}
              onCheckedChange={(v) =>
                update(
                  "glidePath",
                  v
                    ? {
                        enabled: true,
                        bondReturnRate: draft.glidePath?.bondReturnRate ?? 0.03,
                        bondAllocationAtFire: draft.glidePath?.bondAllocationAtFire ?? 0.2,
                        bondAllocationAtHorizon: draft.glidePath?.bondAllocationAtHorizon ?? 0.5,
                      }
                    : {
                        ...(draft.glidePath ?? {
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
        </CardHeader>
        {draft.glidePath?.enabled && (
          <CardContent className="space-y-4">
            <SliderField
              label={t("fire.settings.bond_return")}
              value={draft.glidePath.bondReturnRate}
              min={0.01}
              max={0.06}
              step={0.0025}
              displayValue={(draft.glidePath.bondReturnRate * 100).toFixed(2) + "%"}
              onChange={(v) => update("glidePath", { ...draft.glidePath!, bondReturnRate: v })}
            />
            <SliderField
              label={t("fire.settings.bond_at_fire")}
              value={draft.glidePath.bondAllocationAtFire}
              min={0}
              max={0.6}
              step={0.05}
              displayValue={(draft.glidePath.bondAllocationAtFire * 100).toFixed(0) + "%"}
              onChange={(v) =>
                update("glidePath", { ...draft.glidePath!, bondAllocationAtFire: v })
              }
            />
            <SliderField
              label={t("fire.settings.bond_at_horizon")}
              value={draft.glidePath.bondAllocationAtHorizon}
              min={0}
              max={0.9}
              step={0.05}
              displayValue={(draft.glidePath.bondAllocationAtHorizon * 100).toFixed(0) + "%"}
              onChange={(v) =>
                update("glidePath", { ...draft.glidePath!, bondAllocationAtHorizon: v })
              }
            />
            <p className="text-muted-foreground text-xs">
              {t("fire.settings.glide_explanation", {
                firePct: (draft.glidePath.bondAllocationAtFire * 100).toFixed(0),
                horizonPct: (draft.glidePath.bondAllocationAtHorizon * 100).toFixed(0),
                horizonAge: draft.planningHorizonAge,
                eqFire: ((1 - draft.glidePath.bondAllocationAtFire) * 100).toFixed(0),
                eqHorizon: ((1 - draft.glidePath.bondAllocationAtHorizon) * 100).toFixed(0),
              })}
            </p>
          </CardContent>
        )}
      </Card>

      {/* Portfolio Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("fire.settings.portfolio_accounts_title")}</CardTitle>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("fire.settings.portfolio_accounts_description")}
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {accounts.filter((a) => a.isActive && !a.isArchived).length === 0 ? (
            <p className="text-muted-foreground text-xs">
              {t("fire.settings.no_active_accounts")}
            </p>
          ) : (
            accounts
              .filter((a) => a.isActive && !a.isArchived)
              .map((a) => {
                const isInvestment =
                  a.accountType === "SECURITIES" || a.accountType === "CRYPTOCURRENCY";
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
          <CardTitle className="text-sm">{t("fire.settings.income_streams_title")}</CardTitle>
          <Button variant="outline" size="sm" onClick={addStream}>
            {t("fire.settings.income_add")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.additionalIncomeStreams.length === 0 && (
            <p className="text-muted-foreground text-xs">{t("fire.settings.income_empty")}</p>
          )}
          {draft.additionalIncomeStreams.map((stream) => {
            const isDc = stream.streamType === "dc";
            const hasPension =
              isDc ||
              (stream.currentValue ?? 0) > 0 ||
              (stream.monthlyContribution ?? 0) > 0 ||
              (stream.accumulationReturn ?? 0) > 0;

            // Computed payout preview for DC streams (two-phase: contributions until FIRE, growth-only after)
            const totalYears = Math.max(0, stream.startAge - draft.currentAge);
            const contribYears = Math.max(
              0,
              Math.min(stream.startAge, draft.targetFireAge) - draft.currentAge,
            );
            const growthOnlyYears = totalYears - contribYears;
            const r = stream.accumulationReturn ?? 0.04;
            const fvLump = (stream.currentValue ?? 0) * Math.pow(1 + r, totalYears);
            const fvAnnuityAtStop =
              r > 1e-9
                ? ((stream.monthlyContribution ?? 0) * 12 * (Math.pow(1 + r, contribYears) - 1)) / r
                : (stream.monthlyContribution ?? 0) * 12 * contribYears;
            const fvAnnuity = fvAnnuityAtStop * Math.pow(1 + r, growthOnlyYears);
            const estimatedMonthlyPayout = ((fvLump + fvAnnuity) * draft.safeWithdrawalRate) / 12;

            return (
              <div key={stream.id} className="rounded border p-3">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {/* Label */}
                  <div className="col-span-2 sm:col-span-1">
                    <Label className="text-xs">{t("fire.settings.income_label_field")}</Label>
                    <Input
                      value={stream.label}
                      onChange={(e) => updateStream(stream.id, { label: e.target.value })}
                      placeholder={t("fire.settings.income_placeholder_label")}
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  {/* Monthly amount (DB only) / computed payout preview (DC) */}
                  {isDc ? (
                    <div>
                      <Label className="text-xs">
                        {t("fire.settings.income_est_payout", { currency: draft.currency })}
                      </Label>
                      <p className="mt-1 flex h-8 items-center text-sm font-medium">
                        {Math.round(estimatedMonthlyPayout).toLocaleString()}
                        <span className="text-muted-foreground ml-1 text-xs">
                          {t("fire.settings.income_derived_balance")}
                        </span>
                      </p>
                    </div>
                  ) : (
                    <div>
                      <Label className="text-xs">
                        {t("fire.settings.income_monthly_amount", { currency: draft.currency })}
                      </Label>
                      <Input
                        type="number"
                        value={stream.monthlyAmount}
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
                      <Label className="text-xs">{t("fire.settings.payout_start_age")}</Label>
                      <label className="text-muted-foreground flex cursor-pointer items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={stream.startAgeIsAuto ?? false}
                          onChange={(e) =>
                            updateStream(stream.id, { startAgeIsAuto: e.target.checked })
                          }
                        />
                        {t("fire.settings.auto_checkbox")}
                      </label>
                    </div>
                    {stream.startAgeIsAuto ? (
                      <p className="mt-1 flex h-8 items-center text-sm font-medium">
                        {draft.targetFireAge}
                        <span className="text-muted-foreground ml-1 text-xs">
                          {t("fire.settings.equals_fire_age")}
                        </span>
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
                    <Label className="text-xs">{t("fire.settings.inflation_adjusted")}</Label>
                    <Switch
                      checked={stream.annualGrowthRate === undefined && stream.adjustForInflation}
                      disabled={stream.annualGrowthRate !== undefined}
                      onCheckedChange={(v) => updateStream(stream.id, { adjustForInflation: v })}
                    />
                  </div>
                  {/* Custom growth rate */}
                  <div className="col-span-1 sm:col-span-2">
                    <Label className="text-xs">
                      {t("fire.settings.custom_growth_label")}{" "}
                      <span className="text-muted-foreground">
                        {t("fire.settings.custom_growth_hint")}
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
                        placeholder={t("fire.settings.custom_growth_placeholder")}
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
                          startAgeIsAuto: true,
                        });
                      } else {
                        updateStream(stream.id, {
                          streamType: undefined,
                          currentValue: undefined,
                          monthlyContribution: undefined,
                          accumulationReturn: undefined,
                        });
                      }
                    }}
                  />
                  <Label className="text-muted-foreground cursor-pointer text-xs">
                    {t("fire.settings.accumulation_fund_label")}
                  </Label>
                </div>

                {hasPension && (
                  <div className="bg-muted/40 mt-3 grid grid-cols-1 gap-3 rounded p-3 sm:grid-cols-3">
                    <div>
                      <Label className="text-xs">
                        {t("fire.settings.current_fund_value", { currency: draft.currency })}
                      </Label>
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
                      <Label className="text-xs">
                        {t("fire.settings.monthly_contribution_fund", { currency: draft.currency })}
                      </Label>
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
                      <Label className="text-xs">{t("fire.settings.accumulation_return")}</Label>
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
                        {t("fire.settings.link_account_label")}{" "}
                        <span className="text-muted-foreground">
                          {t("fire.settings.link_account_hint")}
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
                          <option value="">{t("fire.settings.not_linked")}</option>
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
                            {syncingStreamId === stream.id
                              ? t("fire.settings.syncing")
                              : t("fire.settings.sync_value")}
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-muted-foreground col-span-full text-xs">
                      {t("fire.settings.fund_phases_help")}
                    </p>
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-6 text-xs text-red-500 hover:text-red-600"
                  onClick={() => removeStream(stream.id)}
                >
                  {t("fire.settings.remove_stream")}
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
            <CardTitle className="text-sm">{t("fire.settings.alloc_title")}</CardTitle>
            {allocEntries.length > 0 && (
              <p
                className={`mt-1 text-xs ${allocWarning ? "text-red-500" : "text-muted-foreground"}`}
              >
                {t("fire.settings.alloc_total")} {(totalAllocPct * 100).toFixed(1)}%
                {allocWarning ? t("fire.settings.alloc_must_100") : ""}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {holdings.length > 0 && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={autoDetectAllocations}>
                {t("fire.settings.alloc_auto_detect")}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={addAllocation}>
              {t("fire.settings.alloc_add")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {allocEntries.length === 0 && (
            <p className="text-muted-foreground text-xs">{t("fire.settings.alloc_empty_hint")}</p>
          )}
          {allocEntries.map(([sym, weight]) => (
            <div key={sym} className="flex items-center gap-2">
              <Input
                value={sym}
                placeholder={t("fire.settings.alloc_ticker_placeholder")}
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
              <span className="text-muted-foreground text-xs">
                {t("fire.settings.reset_confirm")}
              </span>
              <Button variant="destructive" size="sm" onClick={handleReset}>
                {t("fire.settings.reset_yes")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowResetConfirm(false)}>
                {t("settings.shared.cancel")}
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground text-xs"
              onClick={() => setShowResetConfirm(true)}
            >
              {t("fire.settings.reset_button")}
            </Button>
          )}
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? t("fire.settings.saving") : t("fire.settings.save")}
        </Button>
      </div>
    </div>
  );
}
