import type { Settings } from "@/lib/types";
import { themes } from "@/themes/generated/registry";

type ThemeSelection = Pick<Settings, "themeId"> & Partial<Pick<Settings, "font" | "theme">>;

/**
 * Settings to save when the user picks a theme: the theme, plus the font and
 * mode it suggests. Both stay the user's to change afterwards.
 */
export function themeSelectionUpdate(themeId: string): ThemeSelection {
  const theme = themes.find(({ id }) => id === themeId);
  return {
    themeId,
    ...(theme?.font ? { font: theme.font } : {}),
    ...(theme?.mode ? { theme: theme.mode } : {}),
  };
}
