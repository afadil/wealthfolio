import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Import English translations
import enCommon from "./en/common.json";
import enSettings from "./en/settings.json";
import enDashboard from "./en/dashboard.json";
import enHoldings from "./en/holdings.json";
import enActivity from "./en/activity.json";
import enAccounts from "./en/accounts.json";
import enGoals from "./en/goals.json";
import enIncome from "./en/income.json";
import enAssets from "./en/assets.json";
import enErrors from "./en/errors.json";
import enOnboarding from "./en/onboarding.json";
import enPerformance from "./en/performance.json";
import enTrading from "./en/trading.json";

// Import Vietnamese translations
import viCommon from "./vi/common.json";
import viSettings from "./vi/settings.json";
import viDashboard from "./vi/dashboard.json";
import viHoldings from "./vi/holdings.json";
import viActivity from "./vi/activity.json";
import viAccounts from "./vi/accounts.json";
import viGoals from "./vi/goals.json";
import viIncome from "./vi/income.json";
import viAssets from "./vi/assets.json";
import viErrors from "./vi/errors.json";
import viOnboarding from "./vi/onboarding.json";
import viPerformance from "./vi/performance.json";
import viTrading from "./vi/trading.json";

export const resources = {
  en: {
    common: enCommon,
    settings: enSettings,
    dashboard: enDashboard,
    holdings: enHoldings,
    activity: enActivity,
    accounts: enAccounts,
    goals: enGoals,
    income: enIncome,
    assets: enAssets,
    errors: enErrors,
    onboarding: enOnboarding,
    performance: enPerformance,
    trading: enTrading,
  },
  vi: {
    common: viCommon,
    settings: viSettings,
    dashboard: viDashboard,
    holdings: viHoldings,
    activity: viActivity,
    accounts: viAccounts,
    goals: viGoals,
    income: viIncome,
    assets: viAssets,
    errors: viErrors,
    onboarding: viOnboarding,
    performance: viPerformance,
    trading: viTrading,
  },
} as const;

i18n.use(initReactI18next).init({
  resources,
  lng: "en", // Default language (will be overridden by settings)
  fallbackLng: "en",
  defaultNS: "common",
  ns: [
    "common",
    "settings",
    "dashboard",
    "holdings",
    "activity",
    "accounts",
    "goals",
    "income",
    "assets",
    "errors",
    "onboarding",
    "performance",
    "trading",
  ],
  interpolation: {
    escapeValue: false, // React already escapes
  },
  react: {
    useSuspense: false, // Disable suspense for better error handling
  },
});

export default i18n;
