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
import DashboardPage from "./pages/DashboardPage";
import SimulationsPage from "./pages/SimulationsPage";
import AllocationPage from "./pages/AllocationPage";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function FirePlannerPage() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const { settings, isLoading: settingsLoading } = useFireSettings();
  const portfolioData = usePortfolioData(settings);
  const navigate = useNavigate();

  if (settingsLoading) {
    return (
      <Page>
        <PageHeader heading="FIRE Planner" text="Financial Independence · Retire Early" />
        <PageContent>
          <Skeleton className="h-64 w-full" />
        </PageContent>
      </Page>
    );
  }

  if (!settings.linkedGoalId) {
    return (
      <Page>
        <PageHeader heading="FIRE Planner" text="Financial Independence · Retire Early" />
        <PageContent>
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <div className="bg-muted flex h-14 w-14 items-center justify-center rounded-full text-2xl">
              🎯
            </div>
            <div className="space-y-1">
              <p className="font-semibold">Set up your FIRE plan to get started</p>
              <p className="text-muted-foreground max-w-sm text-sm">
                Configure your retirement parameters in Settings. Saving will create your FIRE goal
                and unlock the planner.
              </p>
            </div>
            <Button onClick={() => navigate("/settings/fire-planner")}>Open FIRE Settings</Button>
          </div>
        </PageContent>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader heading="FIRE Planner" text="Financial Independence · Retire Early" />
      <PageContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="simulations">Simulations</TabsTrigger>
            <TabsTrigger value="allocation">Allocation</TabsTrigger>
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
