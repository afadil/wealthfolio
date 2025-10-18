import { Suspense, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AppLayout } from "@/pages/layouts/app-layout";
import { OnboardingLayout } from "@/pages/layouts/onboarding-layout";
import SettingsLayout from "@/pages/settings/layout";

import ActivityPage from "@/pages/activity/activity-page";
import ActivityImportPage from "@/pages/activity/import/activity-import-page";
import DashboardPage from "@/pages/dashboard/dashboard-page";
import StickyTestPage from "@/pages/dev/sticky-test-page";
import HoldingsPage from "@/pages/holdings/holdings-page";
import IncomePage from "@/pages/income/income-page";
import PerformancePage from "@/pages/performance/performance-page";
import SettingsAccountsPage from "@/pages/settings/accounts/accounts-page";
import SettingsAppearancePage from "@/pages/settings/appearance/appearance-page";
import AccountPage from "./pages/account/account-page";
import AssetProfilePage from "./pages/asset/asset-profile-page";
import OnboardingPage from "./pages/onboarding/onboarding-page";
import AddonSettingsPage from "./pages/settings/addons/addon-settings";
import ContributionLimitPage from "./pages/settings/contribution-limits/contribution-limits-page";
import ExportSettingsPage from "./pages/settings/exports/exports-page";
import GeneralSettingsPage from "./pages/settings/general/general-page";
import SettingsGoalsPage from "./pages/settings/goals/goals-page";
import MarketDataSettingsPage from "./pages/settings/market-data/market-data-settings";
import useGlobalEventListener from "./use-global-event-listener";
// import QRScannerPage from './pages/qr-scanner/qr-scanner-page'; // File not found
import { getDynamicRoutes, subscribeToNavigationUpdates } from "@/addons/addons-runtime-context";
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
      <Routes>
        {/* QR Scanner - No layout for fullscreen camera access */}
        {/* <Route path="/qr-scanner" element={<QRScannerPage />} /> */}

        {/* Onboarding with dedicated layout */}
        <Route path="/onboarding" element={<OnboardingLayout />}>
          <Route index element={<OnboardingPage />} />
        </Route>

        {/* Main app with sidebar */}
        <Route path="/" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="activities" element={<ActivityPage />} />
          <Route path="holdings" element={<HoldingsPage />} />
          <Route path="holdings/:symbol" element={<AssetProfilePage />} />
          <Route path="import" element={<ActivityImportPage />} />
          <Route path="accounts/:id" element={<AccountPage />} />
          <Route path="income" element={<IncomePage />} />
          <Route path="performance" element={<PerformancePage />} />
          <Route path="sticky-test" element={<StickyTestPage />} />
          {/* Dynamic addon routes */}
          {dynamicRoutes.map(({ path, component: Component }) => (
            <Route
              key={path}
              path={path}
              element={
                <Suspense
                  fallback={<div className="flex h-64 items-center justify-center">Loading...</div>}
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
            <Route path="appearance" element={<SettingsAppearancePage />} />
            <Route path="about" element={<AboutSettingsPage />} />
            <Route path="exports" element={<ExportSettingsPage />} />
            <Route path="contribution-limits" element={<ContributionLimitPage />} />
            <Route path="market-data" element={<MarketDataSettingsPage />} />
            <Route path="addons" element={<AddonSettingsPage />} />
          </Route>
          <Route path="*" element={<h1>Not Found</h1>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
