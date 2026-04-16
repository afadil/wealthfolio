import type { TFunction } from "i18next";

/** Maps API kind string to i18n key suffix (`holdings.alt_kind.*`). */
export function apiKindToI18nKey(kind: string): string {
  const k = kind.toLowerCase();
  if (k === "precious") return "precious_metal";
  return k;
}

export function translateAlternativeAssetKind(t: TFunction<"common">, kind: string): string {
  const suffix = apiKindToI18nKey(kind);
  return t(`holdings.alt_kind.${suffix}`, { defaultValue: kind });
}
