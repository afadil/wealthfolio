import type { Locale } from "date-fns";
import { de, enUS } from "date-fns/locale";

/** Active UI language → date-fns locale for chart axes and tooltips. */
export function getDateFnsLocale(language: string | undefined): Locale {
  return language?.startsWith("de") ? de : enUS;
}
