import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Suspense, useState, useEffect } from 'react';

import { AppLayout } from '@/pages/layouts/app-layout';
import SettingsLayout from '@/pages/settings/layout';

import DashboardPage from '@/pages/dashboard/dashboard-page';
import AccountPage from './pages/account/account-page';
import SettingsAppearancePage from '@/pages/settings/appearance/appearance-page';
import SettingsAccountsPage from '@/pages/settings/accounts/accounts-page';
import ActivityPage from '@/pages/activity/activity-page';
import ActivityImportPage from '@/pages/activity/import/activity-import-page';
import HoldingsPage from '@/pages/holdings/holdings-page';
import AssetProfilePage from './pages/asset/asset-profile-page';
import useGlobalEventListener from './use-global-event-listener';
import GeneralSettingsPage from './pages/settings/general/general-page';
import OnboardingPage from './pages/onboarding/onboarding-page';
import SettingsGoalsPage from './pages/settings/goals/goals-page';
import IncomePage from '@/pages/income/income-page';
import ExportSettingsPage from './pages/settings/exports/exports-page';
import ContributionLimitPage from './pages/settings/contribution-limits/contribution-limits-page';
import PerformancePage from '@/pages/performance/performance-page';
import MarketDataSettingsPage from './pages/settings/market-data-settings';
import AddonSettingsPage from './pages/settings/addons/addon-settings';

import AboutSettingsPage from './pages/settings/about/about-page';
import { getDynamicRoutes, subscribeToNavigationUpdates } from '@/addons/addons-runtime-context';

export function AppRoutes() {
  useGlobalEventListener();
  const [dynamicRoutes, setDynamicRoutes] = useState<
    Array<{ path: string; component: React.LazyExoticComponent<React.ComponentType<any>> }>
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
        <Route path="/" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="activities" element={<ActivityPage />} />
          <Route path="holdings" element={<HoldingsPage />} />
          <Route path="holdings/:symbol" element={<AssetProfilePage />} />
          <Route path="import" element={<ActivityImportPage />} />
          <Route path="accounts/:id" element={<AccountPage />} />;
          <Route path="onboarding" element={<OnboardingPage />} />;
          <Route path="income" element={<IncomePage />} />
          <Route path="performance" element={<PerformancePage />} />
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
