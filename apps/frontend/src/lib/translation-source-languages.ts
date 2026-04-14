/** Common ISO codes for MyMemory-style translation (source language of imported blurbs). */
export const NOTES_TRANSLATION_SOURCE_LANGS = [
  "en",
  "de",
  "fr",
  "it",
  "es",
  "pt",
  "nl",
  "pl",
  "ru",
  "ja",
  "ko",
  "zh-CN",
  "zh-TW",
  "sv",
  "da",
  "fi",
  "cs",
  "el",
  "tr",
  "hu",
  "ro",
  "no",
] as const;

export type NotesTranslationSourceLang = (typeof NOTES_TRANSLATION_SOURCE_LANGS)[number];

export function labelForSourceLang(code: string, displayLocale: string): string {
  const c = code.trim();
  if (!c) return code;
  try {
    const dn = new Intl.DisplayNames([displayLocale], { type: "language" });
    const primary = c.split("-")[0];
    if (primary && primary.toLowerCase() === "zh") {
      return c === "zh-TW" ? dn.of("zh-TW") ?? c : dn.of("zh-CN") ?? c;
    }
    return dn.of(primary) ?? c;
  } catch {
    return c;
  }
}
