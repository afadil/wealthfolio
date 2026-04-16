/** BCP 47 language codes for bundled UI translations. Extend when adding locale files. */
export const UI_LOCALES = ["en", "de"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

export function isUiLocale(value: string): value is UiLocale {
  return (UI_LOCALES as readonly string[]).includes(value);
}
