import {
  Button,
  Page,
  PageContent,
  PageHeader,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@wealthfolio/ui";
import { useFireSettings } from "./hooks/use-fire-settings";
import { usePortfolioData } from "./hooks/use-portfolio";
import DashboardPage from "./pages/dashboard-page";
import SimulationsPage from "./pages/simulations-page";
import AllocationPage from "./pages/allocation-page";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

export default function FirePlannerPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("dashboard");
  const { settings, isLoading: settingsLoading } = useFireSettings();
  const portfolioData = usePortfolioData(settings);
  const navigate = useNavigate();

  if (settingsLoading) {
    return (
      <Page>
        <PageHeader heading={t("settings.fire_planner.heading")} text={t("fire_planner.page.tagline")} />
        <PageContent>
          <Skeleton className="h-64 w-full" />
        </PageContent>
      </Page>
    );
  }

  if (!settings.linkedGoalId) {
    return (
      <Page>
        <PageHeader heading={t("settings.fire_planner.heading")} text={t("fire_planner.page.tagline")} />
        <PageContent>
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <div className="bg-muted flex h-14 w-14 items-center justify-center rounded-full text-2xl">
              🎯
            </div>
            <div className="space-y-1">
              <p className="font-semibold">{t("fire_planner.page.setup_title")}</p>
              <p className="text-muted-foreground max-w-sm text-sm">
                {t("fire_planner.page.setup_description")}
              </p>
            </div>
            <Button onClick={() => navigate("/settings/fire-planner")}>
              {t("fire_planner.page.open_fire_settings")}
            </Button>
          </div>
        </PageContent>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader heading={t("settings.fire_planner.heading")} text={t("fire_planner.page.tagline")} />
      <PageContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="dashboard">{t("fire_planner.tab.dashboard")}</TabsTrigger>
            <TabsTrigger value="simulations">{t("fire_planner.tab.simulations")}</TabsTrigger>
            <TabsTrigger value="allocation">{t("fire_planner.tab.allocation")}</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <DashboardPage
              settings={settings}
              portfolioData={portfolioData}
              isLoading={portfolioData.isLoading}
            />
          </TabsContent>

          <TabsContent value="simulations">
            <SimulationsPage
              settings={settings}
              totalValue={portfolioData.totalValue}
              isLoading={portfolioData.isLoading}
            />
          </TabsContent>

          <TabsContent value="allocation">
            <AllocationPage
              settings={settings}
              holdings={portfolioData.holdings}
              activities={portfolioData.activities}
              isLoading={portfolioData.isLoading}
              onSetupTargets={() => navigate("/settings/fire-planner")}
            />
          </TabsContent>
        </Tabs>
      </PageContent>
    </Page>
  );
}
