/**
 * Addon translation API.
 *
 * The implementation lives in the Wealthfolio addon sandbox, which installs a
 * runtime on `globalThis` before any addon code runs. Addon resources live on
 * a dedicated i18next instance, separate from the one serving the host's `ui`
 * catalog, so addons can never read or overwrite the host's strings, and the
 * language always follows the host setting — addons cannot change it.
 *
 * Outside the sandbox (e.g. unit tests of addon code) `registerTranslations`
 * is a warning no-op and `useAddonTranslation` throws.
 */

/** A nested map of translation keys to strings, i18next resource shape. */
export interface AddonTranslationBundle {
  [key: string]: string | AddonTranslationBundle;
}

/**
 * Translations keyed by language code (`en`, `fr`, `de`, `zh-Hant`, ...).
 * Regional aliases are normalized to the host's canonical language: for
 * example, `fr-CA` becomes `fr` and Traditional Chinese aliases such as
 * `zh-TW` become `zh-Hant`. Invalid codes are ignored with a warning.
 * Valid languages the host does not support are stored but never resolved.
 */
export type AddonTranslationResources = Record<string, AddonTranslationBundle>;

export interface AddonTranslationApi {
  /**
   * Translate a key from this addon's registered resources. Supports i18next
   * interpolation and plurals. Lookups are locked to this addon's own
   * namespace and the host language: `ns`, `nsSeparator`, `lng`, `lngs`, and
   * `fallbackLng` options are ignored, `:`-prefixed keys are treated
   * literally, and `$t()` nesting inside translation values is disabled.
   */
  t: (key: string, options?: Record<string, unknown>) => string;
  /** Current UI language as a canonical host code (`en`, `fr`, `zh-Hant`, ...). */
  language: string;
}

/** Implemented and installed by the host sandbox; addons never construct this. */
export interface AddonTranslationRuntime {
  registerTranslations: (resources: AddonTranslationResources) => void;
  useAddonTranslation: () => AddonTranslationApi;
}

declare global {
  // Installed by the Wealthfolio addon sandbox before any addon code runs.
  var __wealthfolioAddonI18n: AddonTranslationRuntime | undefined;
}

/**
 * Register this addon's translations. Call once, in `enable()`, before the
 * first render. Merges per language into the addon's private namespace;
 * missing languages fall back to the addon's `en` bundle.
 */
export function registerTranslations(resources: AddonTranslationResources): void {
  const runtime = globalThis.__wealthfolioAddonI18n;
  if (!runtime) {
    console.warn(
      '[wealthfolio-sdk] registerTranslations is only available inside the Wealthfolio addon sandbox; ignoring call.',
    );
    return;
  }
  runtime.registerTranslations(resources);
}

/**
 * React hook returning a `t` bound to this addon's registered translations.
 * Re-renders when the host language changes.
 */
export function useAddonTranslation(): AddonTranslationApi {
  const runtime = globalThis.__wealthfolioAddonI18n;
  if (!runtime) {
    throw new Error(
      'useAddonTranslation is only available inside the Wealthfolio addon sandbox',
    );
  }
  return runtime.useAddonTranslation();
}
