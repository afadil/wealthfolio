import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import resourcesToBackend from "i18next-resources-to-backend";

import { DEFAULT_LOCALE, DEFAULT_NAMESPACE, NAMESPACES, SUPPORTED_LOCALE_CODES } from "./locales";

export const LANGUAGE_STORAGE_KEY = "wealthfolio-language";

function getCachedLanguage() {
  try {
    const language = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return SUPPORTED_LOCALE_CODES.find((supported) => supported === language) ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

// Language is an explicit, stored user setting (see settings-provider). We do NOT
// auto-detect from the browser/OS. The local cache avoids a default-language flash;
// the settings provider remains authoritative and refreshes it once settings load.
i18n
  .use(
    // Lazy-load `locales/<lng>/<ns>.json` on demand so we don't bundle every
    // language into the initial payload.
    resourcesToBackend(
      (language: string, namespace: string) => import(`./locales/${language}/${namespace}.json`),
    ),
  )
  .use(initReactI18next)
  .init({
    lng: getCachedLanguage(),
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: SUPPORTED_LOCALE_CODES,
    // Script-qualified locales (`zh-Hant`) must not collapse to their base
    // language, so no `languageOnly` folding here. Safe because nothing feeds
    // i18next a raw locale: `getCachedLanguage()` whitelists against
    // SUPPORTED_LOCALE_CODES, and the settings service normalizes server-side
    // (`fr-CA` -> `fr`, `zh-HK` -> `zh-Hant`) before it reaches us. Anything
    // unrecognized would fall back to `en` rather than a base language.
    load: "currentOnly",
    ns: [...NAMESPACES],
    defaultNS: DEFAULT_NAMESPACE,
    interpolation: {
      // React already escapes values.
      escapeValue: false,
    },
    react: {
      useSuspense: true,
    },
    debug: import.meta.env.DEV,
  });

export default i18n;
