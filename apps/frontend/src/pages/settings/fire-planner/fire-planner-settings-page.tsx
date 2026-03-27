import { createGoal, getGoalsAllocation, updateGoal, updateGoalsAllocations } from "@/adapters";
import { useFireSettings } from "@/pages/fire-planner/hooks/use-fire-settings";
import { usePortfolioData } from "@/pages/fire-planner/hooks/use-portfolio";
import { timezoneToCountry } from "@/pages/fire-planner/lib/timezone";
import FireSettingsForm from "@/pages/fire-planner/pages/SettingsPage";
import GuidePage from "@/pages/fire-planner/pages/GuidePage";
import type { FireSettings } from "@/pages/fire-planner/types";
import type { GoalAllocation } from "@/lib/types";
import { Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@wealthfolio/ui";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { SettingsHeader } from "../settings-header";

export default function FirePlannerSettingsPage() {
  const { settings, timezone, isLoading, saveSettings, isSaving } = useFireSettings();
  const portfolioData = usePortfolioData(settings);
  const country = timezoneToCountry(timezone);

  const handleSave = async (updated: FireSettings) => {
    const grossTarget = (updated.monthlyExpensesAtFire * 12) / updated.safeWithdrawalRate;

    let goalId = updated.linkedGoalId ?? null;
    try {
      if (goalId) {
        await updateGoal({
          id: goalId,
          title: "FIRE",
          targetAmount: grossTarget,
          isAchieved: false,
        });
      } else {
        const goal = await createGoal({ title: "FIRE", targetAmount: grossTarget });
        goalId = goal.id;
      }

      // Collect all account IDs that contribute to the FIRE goal:
      // - main investment accounts selected in the planner
      // - accounts linked to income streams with accumulation funds (pension, TFR…)
      const linkedStreamAccountIds = updated.additionalIncomeStreams
        .map((s) => s.linkedAccountId)
        .filter((id): id is string => !!id);
      const allFireAccountIds = [
        ...new Set([...(updated.includedAccountIds ?? []), ...linkedStreamAccountIds]),
      ];

      if (allFireAccountIds.length > 0 && goalId) {
        const allAllocations = await getGoalsAllocation();
        const otherAllocations = allAllocations.filter((a) => a.goalId !== goalId);
        const fireAllocations: GoalAllocation[] = allFireAccountIds.map((accountId) => {
          const existing = allAllocations.find(
            (a) => a.goalId === goalId && a.accountId === accountId,
          );
          return (
            existing ?? {
              id: crypto.randomUUID(),
              goalId: goalId!,
              accountId,
              percentAllocation: 100,
            }
          );
        });
        await updateGoalsAllocations([...otherAllocations, ...fireAllocations]);
      }
    } catch (err) {
      toast({
        title: "Goal sync failed",
        description:
          err instanceof Error ? err.message : "Could not create or update the FIRE goal.",
        variant: "destructive",
      });
    }

    saveSettings({ ...updated, linkedGoalId: goalId ?? undefined });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsHeader
        heading="FIRE Planner"
        text="Configure your Financial Independence · Retire Early settings."
      />
      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="guide">Guide</TabsTrigger>
        </TabsList>
        <TabsContent value="settings" className="mt-6">
          <FireSettingsForm
            settings={settings}
            onSave={handleSave}
            isSaving={isSaving}
            holdings={portfolioData.holdings}
            activities={portfolioData.activities}
            accounts={portfolioData.accounts}
          />
        </TabsContent>
        <TabsContent value="guide" className="mt-6">
          <GuidePage country={country} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
