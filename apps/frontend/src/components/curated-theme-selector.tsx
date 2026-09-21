import { type CSSProperties, useId } from "react";
import { useTranslation } from "react-i18next";
import { Icons } from "@wealthfolio/ui";
import { cn } from "@/lib/utils";
import { isThemeId, resolveThemeId, themes } from "@/themes/generated/registry";

interface ThemePreviewProps {
  tokens: Record<string, string>;
  variables: Record<string, string>;
  className?: string;
}

/** A data-derived illustration, kept decorative so theme cards have concise accessible names. */
export function ThemePreview({ tokens, variables, className }: ThemePreviewProps) {
  const radius = "min(10px, calc(var(--theme-card-radius, var(--radius)) * 0.5))";
  return (
    <div
      aria-hidden="true"
      className={cn("flex h-32 w-full min-w-0 overflow-hidden sm:h-36", className)}
      style={
        {
          ...Object.fromEntries(
            Object.entries({ ...tokens, ...variables }).map(([key, value]) => [`--${key}`, value]),
          ),
          background: tokens.background,
          color: tokens.foreground,
        } as CSSProperties
      }
    >
      <div
        className="flex w-[22%] flex-col gap-1.5 border-r p-2"
        style={{ background: tokens.sidebar, borderColor: tokens.border }}
      >
        <div className="h-1.5 w-2/3 rounded-full" style={{ background: tokens.primary }} />
        <div
          className="h-1 w-full rounded-full opacity-60"
          style={{ background: tokens["muted-foreground"] }}
        />
        <div
          className="h-1 w-4/5 rounded-full opacity-60"
          style={{ background: tokens["muted-foreground"] }}
        />
        <div
          className="h-1 w-3/5 rounded-full opacity-60"
          style={{ background: tokens["muted-foreground"] }}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-2.5">
        {/* Clipped: a row that can scroll becomes a keyboard focus stop. */}
        <div className="flex items-center justify-between gap-2 overflow-hidden">
          <span className="text-sm font-semibold leading-none">Aa</span>
          <span
            className="h-2.5 w-9 shrink"
            style={{ background: tokens.primary, borderRadius: radius }}
          />
        </div>
        <div
          className="flex min-h-0 flex-1 items-end gap-1.5 overflow-hidden border p-1.5"
          style={{
            background: tokens.card,
            borderColor: tokens.border,
            borderRadius: radius,
            boxShadow: "var(--theme-card-shadow, none)",
          }}
        >
          {([1, 2, 3, 4, 5] as const).map((series) => (
            <div
              key={series}
              className="min-w-0 flex-1"
              style={{
                background: tokens[`chart-${series}`],
                height: `${30 + series * 11}%`,
                borderRadius: "min(4px, var(--theme-control-radius, var(--radius)))",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface CuratedThemeSelectorProps {
  value?: string;
  onChange: (value: string) => void;
  className?: string;
}

export function CuratedThemeSelector({ value, onChange, className }: CuratedThemeSelectorProps) {
  const { t } = useTranslation();
  const name = useId();
  const selectedId = resolveThemeId(value);
  return (
    <fieldset className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>
      <legend className="sr-only">{t("settings:appearance_palette_title")}</legend>
      {themes.map((theme) => {
        const isSelected = selectedId === theme.id;
        return (
          <label key={theme.id} className="relative min-w-0 cursor-pointer">
            <input
              type="radio"
              name={name}
              value={theme.id}
              checked={isSelected}
              onClick={() => {
                if (value !== selectedId && theme.id === selectedId) onChange(theme.id);
              }}
              onChange={(event) => {
                if (isThemeId(event.target.value)) onChange(event.target.value);
              }}
              className="peer sr-only"
            />
            <div
              className={cn(
                "peer-focus:ring-ring block overflow-hidden rounded-xl border-2 transition-colors duration-200 peer-focus:ring-2 peer-focus:ring-offset-2 forced-colors:peer-focus:outline-2 forced-colors:peer-focus:outline-offset-2 forced-colors:peer-focus:outline-[Highlight]",
                isSelected
                  ? "border-primary ring-primary/20 ring-2"
                  : "border-border hover:border-primary/50",
              )}
            >
              <div className="dark:hidden">
                <ThemePreview tokens={theme.light} variables={theme.variables.light} />
              </div>
              <div className="hidden dark:block">
                <ThemePreview tokens={theme.dark} variables={theme.variables.dark} />
              </div>
              <span
                className={cn(
                  "relative flex items-center justify-center py-2.5 text-sm font-medium sm:py-3",
                  isSelected ? "bg-primary/10" : "bg-muted/50",
                )}
              >
                {theme.name}
                {isSelected && (
                  <span
                    aria-hidden="true"
                    className="bg-primary absolute right-2 rounded-full p-0.5"
                  >
                    <Icons.Check className="text-primary-foreground h-3 w-3" />
                  </span>
                )}
              </span>
            </div>
          </label>
        );
      })}
    </fieldset>
  );
}
