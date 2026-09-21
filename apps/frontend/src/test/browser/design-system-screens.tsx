import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Link } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@wealthfolio/ui";
import { PrivacyProvider } from "@/context/privacy-context";
import { AuthProvider } from "@/context/auth-context";
import { SettingsProvider, useSettingsContext } from "@/lib/settings-provider";
import { installProfileSession } from "@/features/profiles/session";
import Balance from "@/pages/dashboard/balance";
import { TopHoldings } from "@/pages/dashboard/top-holdings";
import { HoldingsTable } from "@/pages/holdings/components/holdings-table";
import { HoldingsTableMobile } from "@/pages/holdings/components/holdings-table-mobile";
import { PortfolioComposition } from "@/pages/holdings/components/composition-chart";
import { ActivityTable } from "@/pages/activity/components/activity-table/activity-table";
import { ActivityTableMobile } from "@/pages/activity/components/activity-table/activity-table-mobile";
import type { SortingState } from "@tanstack/react-table";
import { previewActivities, previewHoldings } from "./design-system-screen-data";
import "@/i18n/i18n";
import "@/globals.css";
import "./design-system.css";

const params = new URLSearchParams(location.search);
const screen = params.get("screen") ?? "portfolio";
const mobile = innerWidth < 768;
function ScreenPreview() {
  const { settings } = useSettingsContext();
  const [sorting, setSorting] = useState<SortingState>([]);
  if (!settings) return <p>Loading synthetic settings</p>;
  return (
    <div>
      <main
        className="mx-auto h-screen max-w-7xl space-y-6 overflow-auto p-4 sm:p-8"
        data-preview-ready="true"
      >
        <header className="space-y-3">
          <p className="text-muted-foreground text-xs">
            SYNTHETIC DATA · REAL APP COMPONENTS · APPROVED THEMES
          </p>
          <nav className="flex gap-6 text-sm">
            <Link to="/">Portfolio</Link>
            <Link to="/holdings">Holdings</Link>
            <Link to="/activities">Activity</Link>
          </nav>
          <h1 className="text-2xl font-semibold capitalize">{screen}</h1>
        </header>
        {screen === "portfolio" ? (
          <>
            <Balance targetValue={105850.9} currency="USD" displayCurrency />
            <div className="grid gap-6 lg:grid-cols-2">
              <TopHoldings holdings={previewHoldings} baseCurrency="USD" isLoading={false} />
              <PortfolioComposition holdings={previewHoldings} isLoading={false} />
            </div>
          </>
        ) : screen === "holdings" ? (
          <>
            {mobile ? (
              <HoldingsTableMobile
                holdings={previewHoldings}
                isLoading={false}
                selectedTypes={[]}
                setSelectedTypes={() => {}}
                accountFilter={{ type: "all" }}
                onAccountScopeChange={() => {}}
                accounts={[]}
                portfolios={[]}
                showAccountScope={false}
              />
            ) : (
              <HoldingsTable holdings={previewHoldings} isLoading={false} />
            )}
          </>
        ) : (
          <>
            {mobile ? (
              <ActivityTableMobile
                activities={previewActivities}
                isCompactView={false}
                handleEdit={() => {}}
                handleDelete={() => {}}
                onDuplicate={async () => {}}
              />
            ) : (
              <ActivityTable
                activities={previewActivities}
                isLoading={false}
                sorting={sorting}
                onSortingChange={setSorting}
                handleEdit={() => {}}
                handleDelete={() => {}}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
if ((window as Window & { designSystemScreensMocked?: boolean }).designSystemScreensMocked) {
  // The app shell admits a profile after get_profile_state; this fixture renders
  // without the shell, so admit the synthetic profile directly. Until a profile is
  // admitted, every data request throws PROFILE_LOCKED before it is sent.
  installProfileSession({ profileId: "synthetic-profile", scopeId: "synthetic-scope" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  createRoot(document.getElementById("root")!).render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <SettingsProvider>
            <PrivacyProvider>
              <TooltipProvider>
                <ScreenPreview />
              </TooltipProvider>
            </PrivacyProvider>
          </SettingsProvider>
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
} else
  document.getElementById("root")!.textContent =
    "Run through the mocked screen preview test; live API access is disabled.";
