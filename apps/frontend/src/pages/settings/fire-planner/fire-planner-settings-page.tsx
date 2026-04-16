import {
  createGoal,
  getGoals,
  getGoalsAllocation,
  updateGoal,
  updateGoalsAllocations,
} from "@/adapters";
import { useFireSettings } from "@/pages/fire-planner/hooks/use-fire-settings";
import { usePortfolioData } from "@/pages/fire-planner/hooks/use-portfolio";
import { timezoneToCountry } from "@/pages/fire-planner/lib/timezone";
import { calculateFireTarget } from "@/pages/fire-planner/lib/fire-math";
import FireSettingsForm from "@/pages/fire-planner/pages/settings-page";
import GuidePage from "@/pages/fire-planner/pages/guide-page";
import type { FireSettings } from "@/pages/fire-planner/types";
import type { GoalAllocation } from "@/lib/types";
import { Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@wealthfolio/ui";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { useTranslation } from "react-i18next";
import { SettingsHeader } from "../settings-header";

export default function FirePlannerSettingsPage() {
  const { t } = useTranslation();
  const { settings, timezone, isLoading, saveSettings, isSaving } = useFireSettings();
  const portfolioData = usePortfolioData(settings);
  const country = timezoneToCountry(timezone);

  const handleSave = async (updated: FireSettings) => {
    const grossTarget = calculateFireTarget(updated);

    // Prefer the stored linkedGoalId; if missing (e.g. web localStorage cleared),
    // recover the existing FIRE goal by name to avoid creating duplicates.
    let goalId = updated.linkedGoalId ?? null;
    try {
      if (!goalId) {
        const existing = await getGoals();
        goalId = existing.find((g) => g.title === "FIRE (gross)")?.id ?? null;
      }
      if (goalId) {
        await updateGoal({
          id: goalId,
          title: "FIRE (gross)",
          targetAmount: grossTarget,
          isAchieved: false,
        });
      } else {
        const goal = await createGoal({ title: "FIRE (gross)", targetAmount: grossTarget });
        goalId = goal.id;
      }

      // Only the main investment accounts selected in the planner contribute to the goal.
      // Income-stream linked accounts are separate financial instruments — including them
      // would give the goal a wider scope than the projection itself uses.
      const allFireAccountIds = [...new Set(updated.includedAccountIds ?? [])];

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
        title: t("settings.fire_planner.goal_sync_failed_title"),
        description:
          err instanceof Error ? err.message : t("settings.fire_planner.goal_sync_failed_description"),
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
        heading={t("settings.fire_planner.heading")}
        text={t("settings.fire_planner.description")}
      />
      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">{t("settings.fire_planner.tab_settings")}</TabsTrigger>
          <TabsTrigger value="guide">{t("settings.fire_planner.tab_guide")}</TabsTrigger>
        </TabsList>
        <TabsContent value="settings" className="mt-6">
          <FireSettingsForm
            settings={settings}
            onSave={handleSave}
            isSaving={isSaving}
            holdings={portfolioData.holdings}
            activities={portfolioData.activities}
            accounts={portfolioData.accounts}
            activeAccounts={portfolioData.activeAccounts}
          />
        </TabsContent>
        <TabsContent value="guide" className="mt-6">
          <GuidePage country={country} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
