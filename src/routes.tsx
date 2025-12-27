import { Suspense, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { UnsavedChangesProvider } from "@/context/unsaved-changes-context";
import { AppLayout } from "@/pages/layouts/app-layout";
import { OnboardingLayout } from "@/pages/layouts/onboarding-layout";
import SettingsLayout from "@/pages/settings/settings-layout";

import ActivityManagerPage from "@/pages/activity/activity-manager-page";
import CombinedActivityPage from "@/pages/activity/combined-activity-page";
import ActivityImportPage from "@/pages/activity/import/activity-import-page";
import AssetsPage from "@/pages/asset/assets-page";
import DashboardPage from "@/pages/dashboard/dashboard-page";
import HoldingsPage from "@/pages/holdings/holdings-page";
import PortfolioInsightsPage from "@/pages/insights/portfolio-insights";
import CashflowPage from "@/pages/cashflow/cashflow-page";
import ReportsPage from "@/pages/reports/reports-page";
import SettingsAccountsPage from "@/pages/settings/accounts/accounts-page";
import SettingsAppearancePage from "@/pages/settings/appearance/appearance-page";
import CategoriesPage from "@/pages/settings/categories/categories-page";
import ActivityRulesPage from "@/pages/settings/activity-rules/activity-rules-page";
import { EventsPage } from "@/pages/settings/events/events-page";
import CashImportPage from "@/pages/cash/activities/import/cash-import-page";
import AccountPage from "./pages/account/account-page";
import AssetProfilePage from "./pages/asset/asset-profile-page";
import OnboardingPage from "./pages/onboarding/onboarding-page";
import AddonSettingsPage from "./pages/settings/addons/addon-settings";
import ContributionLimitPage from "./pages/settings/contribution-limits/contribution-limits-page";
import ExportSettingsPage from "./pages/settings/exports/exports-page";
import GeneralSettingsPage from "./pages/settings/general/general-page";
import SettingsGoalsPage from "./pages/settings/goals/goals-page";
import BudgetPage from "./pages/settings/budget/budget-page";
import MarketDataImportPage from "./pages/settings/market-data/market-data-import-page";
import MarketDataSettingsPage from "./pages/settings/market-data/market-data-settings";
import useGlobalEventListener from "./use-global-event-listener";
import { getDynamicRoutes, subscribeToNavigationUpdates } from "@/addons/addons-runtime-context";
import NotFoundPage from "@/pages/not-found";
import HoldingsInsightsPage from "./pages/holdings/holdings-insights-page";
import AboutSettingsPage from "./pages/settings/about/about-page";

export function AppRoutes() {
  useGlobalEventListener();
  const [dynamicRoutes, setDynamicRoutes] = useState<
    { path: string; component: React.LazyExoticComponent<React.ComponentType<unknown>> }[]
  >([]);

  // Subscribe to dynamic route updates
  useEffect(() => {
    const updateRoutes = () => {
      setDynamicRoutes(getDynamicRoutes());
    };

    // Initial load
    updateRoutes();

    // Subscribe to updates
    const unsubscribe = subscribeToNavigationUpdates(updateRoutes);

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <BrowserRouter>
      <UnsavedChangesProvider>
        <Routes>
          {/* Onboarding with dedicated layout */}
          <Route path="/onboarding" element={<OnboardingLayout />}>
            <Route index element={<OnboardingPage />} />
          </Route>

          {/* Main app with sidebar */}
          <Route path="/" element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="activity" element={<CombinedActivityPage />} />
            <Route path="activity/manage" element={<ActivityManagerPage />} />
            <Route path="activity/import" element={<ActivityImportPage />} />
            <Route path="activity/cash-import" element={<CashImportPage />} />
            <Route path="holdings" element={<HoldingsPage />} />
            <Route path="holdings-insights" element={<HoldingsInsightsPage />} />
            <Route path="holdings/:symbol" element={<AssetProfilePage />} />
            <Route path="accounts/:id" element={<AccountPage />} />
            <Route path="cashflow" element={<CashflowPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="insights" element={<PortfolioInsightsPage />} />
            {/* Dynamic addon routes */}
            {dynamicRoutes.map(({ path, component: Component }) => (
              <Route
                key={path}
                path={path}
                element={
                  <Suspense
                    fallback={
                      <div className="flex h-64 items-center justify-center">Loading...</div>
                    }
                  >
                    <Component />
                  </Suspense>
                }
              />
            ))}
            <Route path="settings" element={<SettingsLayout />}>
              <Route index element={<GeneralSettingsPage />} />
              <Route path="general" element={<GeneralSettingsPage />} />
              <Route path="accounts" element={<SettingsAccountsPage />} />
              <Route path="goals" element={<SettingsGoalsPage />} />
              <Route path="budget" element={<BudgetPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="activity-rules" element={<ActivityRulesPage />} />
              <Route path="events" element={<EventsPage />} />
              <Route path="appearance" element={<SettingsAppearancePage />} />
              <Route path="about" element={<AboutSettingsPage />} />
              <Route path="exports" element={<ExportSettingsPage />} />
              <Route path="contribution-limits" element={<ContributionLimitPage />} />
              <Route path="market-data" element={<MarketDataSettingsPage />} />
              <Route path="market-data/import" element={<MarketDataImportPage />} />
              <Route path="securities" element={<AssetsPage />} />
              <Route path="addons" element={<AddonSettingsPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </UnsavedChangesProvider>
    </BrowserRouter>
  );
}
