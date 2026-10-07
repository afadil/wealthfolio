import { FormControl, FormItem, FormLabel } from "@wealthfolio/ui/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@wealthfolio/ui/components/ui/radio-group";
import { SelectionCard } from "@/components/selection-card";
import { cn } from "@/lib/utils";
import { resolveThemeId, themes, type ThemeDefinition } from "@/themes/generated/registry";
import { useTranslation } from "react-i18next";

interface ThemeSelectorProps {
  value?: string;
  onChange: (value: string) => void;
  /** Curated theme whose light and dark palettes the previews show. */
  themeId?: string;
  className?: string;
}

type ModeTokens = ThemeDefinition["light"];

/** A miniature page in one mode of the selected theme, drawn from its tokens. */
function ModePreview({ tokens, className }: { tokens: ModeTokens; className?: string }) {
  const bar = { background: tokens.secondary };
  return (
    <div
      aria-hidden="true"
      className={cn("space-y-1 p-1.5 sm:p-2", className)}
      style={{ background: tokens.background }}
    >
      <div className="space-y-1 rounded-md p-1 sm:p-1.5" style={{ background: tokens.card }}>
        <div className="h-1 w-2/5 rounded-lg sm:h-2" style={bar} />
        <div className="h-1 w-1/2 rounded-lg sm:h-2" style={bar} />
      </div>
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className="flex items-center gap-1 rounded-md p-1 sm:gap-2 sm:p-1.5"
          style={{ background: tokens.card }}
        >
          <div className="h-2 w-2 shrink-0 rounded-full sm:h-3 sm:w-3" style={bar} />
          <div className="h-1 w-1/2 rounded-lg sm:h-2" style={bar} />
        </div>
      ))}
    </div>
  );
}

export function ThemeSelector({ value, onChange, themeId, className }: ThemeSelectorProps) {
  const { t } = useTranslation();
  const theme = themes.find(({ id }) => id === resolveThemeId(themeId)) ?? themes[0];
  const modes = [
    {
      value: "light",
      label: t("common:component.theme_light_label"),
      preview: <ModePreview tokens={theme.light} />,
    },
    {
      value: "dark",
      label: t("common:component.theme_dark_label"),
      preview: <ModePreview tokens={theme.dark} />,
    },
    {
      value: "system",
      label: t("common:component.theme_system_label"),
      preview: (
        <div className="flex">
          <ModePreview tokens={theme.light} className="w-1/2" />
          <ModePreview tokens={theme.dark} className="w-1/2" />
        </div>
      ),
    },
  ];
  return (
    <RadioGroup
      onValueChange={onChange}
      value={value}
      className={cn("grid grid-cols-3 gap-2 md:gap-4", className)}
    >
      {modes.map((mode) => (
        <FormItem key={mode.value}>
          <FormLabel className="[&:has(:focus-visible)]:ring-ring block cursor-pointer rounded-xl [&:has(:focus-visible)]:ring-2 [&:has(:focus-visible)]:ring-offset-2">
            <FormControl>
              <RadioGroupItem value={mode.value} className="sr-only" />
            </FormControl>
            <SelectionCard selected={value === mode.value} label={mode.label}>
              {mode.preview}
            </SelectionCard>
          </FormLabel>
        </FormItem>
      ))}
    </RadioGroup>
  );
}
