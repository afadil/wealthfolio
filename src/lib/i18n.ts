import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// Import translation files
import commonEn from "@/locales/en/common.json";
import settingsEn from "@/locales/en/settings.json";
import dashboardEn from "@/locales/en/dashboard.json";
import activityEn from "@/locales/en/activity.json";
import holdingsEn from "@/locales/en/holdings.json";
import performanceEn from "@/locales/en/performance.json";
import accountEn from "@/locales/en/account.json";
import goalsEn from "@/locales/en/goals.json";
import incomeEn from "@/locales/en/income.json";

import commonFr from "@/locales/fr/common.json";
import settingsFr from "@/locales/fr/settings.json";
import dashboardFr from "@/locales/fr/dashboard.json";
import activityFr from "@/locales/fr/activity.json";
import holdingsFr from "@/locales/fr/holdings.json";
import performanceFr from "@/locales/fr/performance.json";
import accountFr from "@/locales/fr/account.json";
import goalsFr from "@/locales/fr/goals.json";
import incomeFr from "@/locales/fr/income.json";

export const defaultNS = "common";
export const resources = {
  en: {
    common: commonEn,
    settings: settingsEn,
    dashboard: dashboardEn,
    activity: activityEn,
    holdings: holdingsEn,
    performance: performanceEn,
    account: accountEn,
    goals: goalsEn,
    income: incomeEn,
  },
  fr: {
    common: commonFr,
    settings: settingsFr,
    dashboard: dashboardFr,
    activity: activityFr,
    holdings: holdingsFr,
    performance: performanceFr,
    account: accountFr,
    goals: goalsFr,
    income: incomeFr,
  },
} as const;

i18n
  // Detect user language
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next
  .use(initReactI18next)
  // Initialize i18next
  .init({
    resources,
    defaultNS,
    fallbackLng: "en",
    supportedLngs: ["en", "fr"],
    // Enable language detection that works with regional codes (e.g., en-US -> en)
    load: "languageOnly",
    debug: import.meta.env.DEV,

    interpolation: {
      escapeValue: false, // React already escapes values
      prefix: "{",
      suffix: "}",
    },

    detection: {
      // Order: user preference (localStorage), then OS/browser language (navigator)
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "i18nextLng",
    },
  });

export default i18n;
