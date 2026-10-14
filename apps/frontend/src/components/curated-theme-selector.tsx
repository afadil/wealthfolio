import { type CSSProperties, type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { SelectionCard } from "@/components/selection-card";
import { isThemeId, resolveThemeId, themes } from "@/themes/generated/registry";
import { Icons } from "@wealthfolio/ui";

interface ThemePreviewProps {
  tokens: Record<string, string>;
  variables: Record<string, string>;
  /** Font role the theme suggests; previews otherwise use the current font. */
  font?: string;
  className?: string;
}

// A miniature of the dashboard. Every colour and radius comes from the theme's
// own variables, set on the root below, so the card shows what picking it does.
const ink = (token: string, percent: number) =>
  `color-mix(in srgb, var(--${token}) ${percent}%, transparent)`;
// Full-size geometry scaled for a ~200px miniature; pills stay pills.
const scaled = (radius: string, factor: number) => `calc(${radius} * ${factor})`;
const CARD_RADIUS = scaled("var(--theme-card-radius, var(--radius))", 0.4);
const SEGMENT_RADIUS = scaled("var(--theme-segmented-radius, var(--radius))", 0.5);
const BUTTON_RADIUS = scaled(
  "var(--theme-button-radius, var(--theme-control-radius, 9999px))",
  0.5,
);
const BADGE_RADIUS = scaled("var(--theme-badge-radius, 9999px)", 0.5);
const ALLOCATION = [38, 24, 16, 13, 9];
const TREND = "M0,23 C8,22 12,14 20,15 S32,24 40,19 S54,9 62,12 S78,21 86,12 S102,5 120,6";

function PreviewCard({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-w-0 flex-col gap-[4px] p-[5px]"
      style={{
        background: "var(--card)",
        border: "solid var(--border)",
        borderWidth: "var(--theme-card-side-border, 1px)",
        borderRadius: CARD_RADIUS,
        boxShadow: "var(--theme-card-shadow, none)",
      }}
    >
      {children}
    </div>
  );
}

function Line({ width, tone = 45 }: { width: string; tone?: number }) {
  return (
    <span
      className="h-[2px] shrink-0 rounded-full"
      style={{ width, background: ink("foreground", tone) }}
    />
  );
}

/** A data-derived illustration, kept decorative so theme cards have concise accessible names. */
export function ThemePreview({ tokens, variables, font, className }: ThemePreviewProps) {
  const gradientId = `theme-trend-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <div
      aria-hidden="true"
      className={cn("flex h-28 w-full min-w-0 overflow-hidden sm:h-32", className)}
      style={
        {
          ...Object.fromEntries(
            Object.entries({ ...tokens, ...variables }).map(([key, value]) => [`--${key}`, value]),
          ),
          background: tokens.background,
          color: tokens.foreground,
          fontFamily: font ? `var(--${font})` : undefined,
        } as CSSProperties
      }
    >
      {/* Icon rail: logo, active page, other pages. */}
      <div
        className="flex w-[14%] min-w-[18px] flex-col items-center gap-[6px] border-r pt-2"
        style={{ background: "var(--sidebar)", borderColor: "var(--sidebar-border)" }}
      >
        <span className="size-[9px] rounded-full" style={{ background: "var(--primary)" }} />
        <span
          className="flex size-[13px] items-center justify-center rounded-[3px]"
          style={{ background: "var(--sidebar-accent)" }}
        >
          <span
            className="size-[6px] rounded-[2px]"
            style={{ background: ink("sidebar-foreground", 80) }}
          />
        </span>
        {[0, 1, 2].map((item) => (
          <span
            key={item}
            className="size-[6px] rounded-[2px]"
            style={{ background: ink("sidebar-foreground", 35) }}
          />
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-[5px] overflow-hidden p-2">
        {/* Investments / Net Worth / Spending tabs, and the page's primary action. */}
        <div className="flex items-center justify-between gap-1">
          <span
            className="flex gap-[2px] p-[2px]"
            style={{ background: "var(--muted)", borderRadius: SEGMENT_RADIUS }}
          >
            {[0, 1, 2].map((tab) => (
              <span
                key={tab}
                className="flex h-[9px] w-[17px] items-center justify-center"
                style={{
                  background: tab === 0 ? "var(--background)" : undefined,
                  borderRadius: SEGMENT_RADIUS,
                  boxShadow: tab === 0 ? "0 1px 2px rgb(0 0 0 / 0.12)" : undefined,
                }}
              >
                <span
                  className="h-[2px] w-[9px] rounded-full"
                  style={{
                    background: tab === 0 ? ink("foreground", 70) : ink("muted-foreground", 55),
                  }}
                />
              </span>
            ))}
          </span>
          <span
            className="h-[9px] w-[22px] shrink-0"
            style={{ background: "var(--primary)", borderRadius: BUTTON_RADIUS }}
          />
        </div>

        {/* Portfolio value in the theme's type, with its change below. */}
        <div className="flex flex-col gap-[3px]">
          <span className="text-[13px] font-semibold tabular-nums leading-none tracking-tight">
            48,250<span style={{ color: "var(--muted-foreground)" }}>.12</span>
          </span>
          <span className="flex gap-[4px]">
            <span className="h-[3px] w-[16px] rounded-full" style={{ background: "var(--gain)" }} />
            <span
              className="h-[3px] w-[11px] rounded-full"
              style={{ background: ink("gain", 70) }}
            />
            <span
              className="h-[3px] w-[14px] rounded-full"
              style={{ background: ink("muted-foreground", 45) }}
            />
          </span>
        </div>

        <svg
          className="-mx-2 min-h-[16px] w-[calc(100%+1rem)] flex-1"
          viewBox="0 0 120 30"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" style={{ stopColor: "var(--gain)", stopOpacity: 0.28 }} />
              <stop offset="1" style={{ stopColor: "var(--gain)", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <path d={`${TREND} L120,30 L0,30 Z`} fill={`url(#${gradientId})`} />
          <path
            d={TREND}
            fill="none"
            stroke="var(--gain)"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Allocation and holdings cards. */}
        <div className="grid grid-cols-2 gap-[5px]">
          <PreviewCard>
            <span className="flex h-[4px] overflow-hidden rounded-full">
              {ALLOCATION.map((share, index) => (
                <span
                  key={index}
                  style={{ width: `${share}%`, background: `var(--chart-${index + 1})` }}
                />
              ))}
            </span>
            {[60, 45].map((width) => (
              <span key={width} className="flex items-center justify-between">
                <Line width={`${width}%`} />
                <Line width="22%" tone={70} />
              </span>
            ))}
          </PreviewCard>
          <PreviewCard>
            {(["gain", "loss"] as const).map((tone) => (
              <span key={tone} className="flex items-center gap-[3px]">
                <span
                  className="size-[7px] shrink-0 rounded-full"
                  style={{ background: "var(--muted)" }}
                />
                <Line width="34%" />
                <span
                  className="ml-auto h-[5px] w-[14px] shrink-0"
                  style={{ background: ink(tone, 30), borderRadius: BADGE_RADIUS }}
                />
              </span>
            ))}
          </PreviewCard>
        </div>
      </div>
    </div>
  );
}

export const designedForKeys = {
  dark: "settings:appearance_theme_designed_for_dark",
  light: "settings:appearance_theme_designed_for_light",
} as const;

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
        const ModeIcon = theme.mode === "dark" ? Icons.Moon : Icons.Sun;
        const designedFor = theme.mode && t(designedForKeys[theme.mode], { theme: theme.name });
        return (
          <label key={theme.id} className="relative min-w-0 cursor-pointer">
            <input
              type="radio"
              name={name}
              value={theme.id}
              checked={isSelected}
              aria-describedby={designedFor ? `${name}-${theme.id}-mode` : undefined}
              onClick={() => {
                if (value !== selectedId && theme.id === selectedId) onChange(theme.id);
              }}
              onChange={(event) => {
                if (isThemeId(event.target.value)) onChange(event.target.value);
              }}
              className="peer sr-only"
            />
            <SelectionCard
              selected={isSelected}
              label={
                <span className="flex items-center gap-1.5">
                  {theme.name}
                  {designedFor && (
                    <span id={`${name}-${theme.id}-mode`} title={designedFor} aria-hidden="true">
                      <span className="sr-only">{designedFor}</span>
                      <ModeIcon className="text-muted-foreground size-3.5" />
                    </span>
                  )}
                </span>
              }
              className="peer-focus:ring-ring peer-focus:ring-2 peer-focus:ring-offset-2 forced-colors:peer-focus:outline-2 forced-colors:peer-focus:outline-offset-2 forced-colors:peer-focus:outline-[Highlight]"
            >
              <div className="dark:hidden">
                <ThemePreview
                  tokens={theme.light}
                  variables={theme.variables.light}
                  font={theme.font}
                />
              </div>
              <div className="hidden dark:block">
                <ThemePreview
                  tokens={theme.dark}
                  variables={theme.variables.dark}
                  font={theme.font}
                />
              </div>
            </SelectionCard>
          </label>
        );
      })}
    </fieldset>
  );
}
