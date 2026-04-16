import { syncShellLocale } from "@/adapters";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import deCommon from "./locales/de/common.json";
import enCommon from "./locales/en/common.json";
import { isUiLocale, type UiLocale } from "./supported-locales";

export const UI_LANG_STORAGE_KEY = "wealthfolio-ui-locale";

function readStoredLocale(): UiLocale | null {
  try {
    const raw = localStorage.getItem(UI_LANG_STORAGE_KEY);
    if (raw && isUiLocale(raw)) {
      return raw;
    }
  } catch {
    // localStorage may be unavailable
  }
  return null;
}

function persistLocale(lng: string) {
  try {
    localStorage.setItem(UI_LANG_STORAGE_KEY, lng);
  } catch {
    // noop
  }
}

function resolveInitialLocale(): UiLocale {
  const stored = readStoredLocale();
  if (stored) {
    return stored;
  }
  if (typeof navigator !== "undefined") {
    const primary = navigator.language?.split("-")[0]?.toLowerCase();
    if (primary && isUiLocale(primary)) {
      return primary;
    }
  }
  return "en";
}

const initialLocale = resolveInitialLocale();

function scheduleInitialShellLocaleSync(locale: UiLocale) {
  // On desktop, app startup can race native command registration.
  // Retry a few times so menu/dialog locale is eventually applied.
  const delaysMs = [0, 400, 1200, 2500];
  for (const delay of delaysMs) {
    window.setTimeout(() => {
      void syncShellLocale(locale);
    }, delay);
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { common: enCommon },
    de: { common: deCommon },
  },
  defaultNS: "common",
  ns: ["common"],
  lng: initialLocale,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

if (typeof document !== "undefined") {
  document.documentElement.lang = i18n.language;
}

if (typeof window !== "undefined") {
  scheduleInitialShellLocaleSync(initialLocale);
} else {
  void syncShellLocale(initialLocale);
}

i18n.on("languageChanged", (lng) => {
  persistLocale(lng);
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng;
  }
  void syncShellLocale(lng);
});

export default i18n;
