import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// Import translation files
import commonEn from "@/locales/en/common.json";
import settingsEn from "@/locales/en/settings.json";
import dashboardEn from "@/locales/en/dashboard.json";

import commonFr from "@/locales/fr/common.json";
import settingsFr from "@/locales/fr/settings.json";
import dashboardFr from "@/locales/fr/dashboard.json";

export const defaultNS = "common";
export const resources = {
  en: {
    common: commonEn,
    settings: settingsEn,
    dashboard: dashboardEn,
  },
  fr: {
    common: commonFr,
    settings: settingsFr,
    dashboard: dashboardFr,
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
    },

    detection: {
      // Order: user preference (localStorage), then OS/browser language (navigator)
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "i18nextLng",
    },
  });

export default i18n;
