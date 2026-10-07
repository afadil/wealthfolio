import type { Settings } from "@/lib/types";
import { themes } from "@/themes/generated/registry";

/**
 * Settings to save when the user picks a theme: the theme, plus the font it
 * suggests. The Font setting stays the user's to change afterwards.
 */
export function themeSelectionUpdate(
  themeId: string,
): Pick<Settings, "themeId"> & Partial<Pick<Settings, "font">> {
  const font = themes.find((theme) => theme.id === themeId)?.font;
  return font ? { themeId, font } : { themeId };
}
