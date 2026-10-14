import type { Settings } from "@/lib/types";
import { themes } from "@/themes/generated/registry";

type ThemeSelection = Pick<Settings, "themeId"> & Partial<Pick<Settings, "font">>;

/**
 * Settings to save when the user picks a theme: the theme, plus the font it
 * suggests, which stays the user's to change afterwards. The appearance mode is
 * never changed; Settings offers the mode a theme is designed for instead.
 */
export function themeSelectionUpdate(themeId: string): ThemeSelection {
  const theme = themes.find(({ id }) => id === themeId);
  return { themeId, ...(theme?.font ? { font: theme.font } : {}) };
}
