import { BrowserRouter, Route, Routes } from 'react-router-dom';

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
import useGlobalEventListener from './useGlobalEventListener';
import GeneralSettingsPage from './pages/settings/general/general-page';
import OnboardingPage from './pages/onboarding/onboarding-page';
import SettingsGoalsPage from './pages/settings/goals/goals-page';
import ExchangeRatesPage from './pages/settings/currencies/exchange-rates-page';

export function AppRoutes() {
  useGlobalEventListener();
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
          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<GeneralSettingsPage />} />
            <Route path="general" element={<GeneralSettingsPage />} />
            <Route path="accounts" element={<SettingsAccountsPage />} />
            <Route path="goals" element={<SettingsGoalsPage />} />
            <Route path="appearance" element={<SettingsAppearancePage />} />
            <Route path="exchange-rates" element={<ExchangeRatesPage />} />
          </Route>
          <Route path="*" element={<h1>Not Found</h1>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
