import {
  Page,
  PageContent,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@wealthfolio/ui";
import { useState, useMemo } from "react";
import { useFireSettings } from "./hooks/use-fire-settings";
import { usePortfolioData } from "./hooks/use-portfolio";
import DashboardPage from "./pages/DashboardPage";
import SimulationsPage from "./pages/SimulationsPage";
import AllocationPage from "./pages/AllocationPage";
import SettingsPage from "./pages/SettingsPage";
import GuidePage from "./pages/GuidePage";

// IANA timezone → ISO 3166-1 alpha-2 country code
const TZ_TO_COUNTRY: Record<string, string> = {
  "Europe/Rome": "IT",
  "Europe/London": "GB",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Busingen": "DE",
  "Europe/Madrid": "ES",
  "Europe/Amsterdam": "NL",
  "Europe/Brussels": "BE",
  "Europe/Zurich": "CH",
  "Europe/Vienna": "AT",
  "Europe/Stockholm": "SE",
  "Europe/Oslo": "NO",
  "Europe/Copenhagen": "DK",
  "Europe/Helsinki": "FI",
  "Europe/Warsaw": "PL",
  "Europe/Lisbon": "PT",
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Phoenix": "US",
  "America/Anchorage": "US",
  "America/Detroit": "US",
  "Pacific/Honolulu": "US",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Asia/Tokyo": "JP",
};

export default function FirePlannerPage() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const {
    settings,
    timezone,
    isLoading: settingsLoading,
    saveSettings,
    isSaving,
  } = useFireSettings();
  const portfolioData = usePortfolioData(settings);
  const country = useMemo(() => (timezone ? TZ_TO_COUNTRY[timezone] : undefined), [timezone]);

  return (
    <Page>
      <PageHeader heading="FIRE Planner" text="Financial Independence · Retire Early" />
      <PageContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="simulations">Simulations</TabsTrigger>
            <TabsTrigger value="allocation">Allocation</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="guide">Guide</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <DashboardPage
              settings={settings}
              portfolioData={portfolioData}
              isLoading={settingsLoading || portfolioData.isLoading}
            />
          </TabsContent>

          <TabsContent value="simulations">
            <SimulationsPage
              settings={settings}
              totalValue={portfolioData.totalValue}
              isLoading={settingsLoading || portfolioData.isLoading}
            />
          </TabsContent>

          <TabsContent value="allocation">
            <AllocationPage
              settings={settings}
              holdings={portfolioData.holdings}
              activities={portfolioData.activities}
              isLoading={portfolioData.isLoading}
              onSetupTargets={() => setActiveTab("settings")}
            />
          </TabsContent>

          <TabsContent value="guide">
            <GuidePage country={country} />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsPage
              settings={settings}
              onSave={saveSettings}
              isSaving={isSaving}
              holdings={portfolioData.holdings}
              activities={portfolioData.activities}
              accounts={portfolioData.accounts}
            />
          </TabsContent>
        </Tabs>
      </PageContent>
    </Page>
  );
}
