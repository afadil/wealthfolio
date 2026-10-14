import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as z from "zod";

import { CuratedThemeSelector, designedForKeys } from "@/components/curated-theme-selector";
import { FontSelector } from "@/components/font-selector";
import { ThemeSelector } from "@/components/theme-selector";
import { usePlatform } from "@/hooks/use-platform";
import { useSettingsContext } from "@/lib/settings-provider";
import { cn } from "@/lib/utils";
import {
  type NavigationMode,
  useNavigationMode,
} from "@/pages/layouts/navigation/navigation-mode-context";
import { isThemeId, resolveThemeId, themes } from "@/themes/generated/registry";
import { themeSelectionUpdate } from "@/themes/selection";
import { AnimatedToggleGroup, Button, Card, Icons } from "@wealthfolio/ui";
import { Form, FormField } from "@wealthfolio/ui/components/ui/form";
import { Switch } from "@wealthfolio/ui/components/ui/switch";

interface AppearanceFormValues {
  theme: "light" | "dark" | "system";
  font: "font-mono" | "font-sans" | "font-serif";
  menuBarVisible: boolean;
}

const fontLabelKeys = {
  "font-sans": "common:component.font_sans",
  "font-serif": "common:component.font_serif",
  "font-mono": "common:component.font_mono",
} as const;
const switchModeKeys = {
  dark: "settings:appearance_switch_to_dark",
  light: "settings:appearance_switch_to_light",
} as const;

function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="space-y-1">
        <h2 className="text-base font-medium">{title}</h2>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** One preference: what it is on the left, its control on the right (stacked on phones). */
function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function AppearanceForm() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettingsContext();
  const { isMobile } = usePlatform();
  const { mode: navigationMode, setMode: setNavigationMode } = useNavigationMode();
  const appearanceFormSchema = z.object({
    theme: z.enum(["light", "dark", "system"], {
      required_error: t("settings:appearance_theme_required"),
    }),
    font: z.enum(["font-mono", "font-sans", "font-serif"], {
      invalid_type_error: t("settings:appearance_font_error"),
      required_error: t("settings:appearance_font_required"),
    }),
    menuBarVisible: z.boolean(),
  });
  const defaultValues: AppearanceFormValues = {
    theme: (settings?.theme ?? "system") as AppearanceFormValues["theme"],
    font: (settings?.font ?? "font-mono") as AppearanceFormValues["font"],
    menuBarVisible: settings?.menuBarVisible ?? true,
  };
  const form = useForm<AppearanceFormValues>({
    resolver: zodResolver(appearanceFormSchema),
    values: defaultValues,
  });
  const activeTheme = themes.find(({ id }) => id === resolveThemeId(settings?.themeId));
  const ModeIcon = activeTheme?.mode === "dark" ? Icons.Moon : Icons.Sun;

  function save(data: Parameters<typeof updateSettings>[0]) {
    return updateSettings(data).catch((error) => {
      console.error("Failed to update appearance settings:", error);
    });
  }

  // Picking a theme also applies the font it suggests; the mode stays the user's.
  function selectTheme(themeId: string) {
    if (!isThemeId(themeId)) return;
    void save(themeSelectionUpdate(themeId));
  }

  const fontDiffersFromTheme = !!activeTheme?.font && settings?.font !== activeTheme.font;

  return (
    <Form {...form}>
      <div className="max-w-4xl space-y-8">
        <Card className="overflow-hidden">
          <FormField
            control={form.control}
            name="theme"
            render={({ field }) => (
              <SettingRow
                title={t("settings:appearance_mode_title")}
                description={t("settings:appearance_mode_description")}
              >
                <ThemeSelector
                  aria-label={t("settings:appearance_mode_title")}
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    void save({ theme: value });
                  }}
                />
              </SettingRow>
            )}
          />
        </Card>

        <section className="space-y-3">
          <SectionHeading
            title={t("settings:appearance_palette_title")}
            description={t("settings:appearance_palette_description")}
          />
          <CuratedThemeSelector value={settings?.themeId} onChange={selectTheme} />
          {activeTheme?.mode && (
            // Shown only while the other mode is in effect, including through System.
            <div
              className={cn(
                "bg-muted/40 items-center gap-3 rounded-lg border px-4 py-3",
                activeTheme.mode === "dark" ? "flex dark:hidden" : "hidden dark:flex",
              )}
            >
              <ModeIcon className="text-muted-foreground size-4 shrink-0" />
              <p className="min-w-0 flex-1 text-sm">
                {t(designedForKeys[activeTheme.mode], { theme: activeTheme.name })}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  const mode = activeTheme.mode;
                  if (mode) void save({ theme: mode });
                }}
              >
                {t(switchModeKeys[activeTheme.mode])}
              </Button>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <SectionHeading
            title={t("settings:appearance_text_title")}
            action={
              fontDiffersFromTheme && activeTheme ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0"
                  onClick={() => void save(themeSelectionUpdate(activeTheme.id))}
                >
                  {t("settings:appearance_use_theme_defaults")}
                </Button>
              ) : undefined
            }
          />
          <Card className="divide-y overflow-hidden">
            <FormField
              control={form.control}
              name="font"
              render={({ field }) => (
                <SettingRow
                  title={t("settings:appearance_font_title")}
                  description={
                    activeTheme?.font
                      ? t("settings:appearance_theme_suggests", {
                          theme: activeTheme.name,
                          value: t(fontLabelKeys[activeTheme.font]),
                        })
                      : t("settings:appearance_font_description")
                  }
                >
                  <FontSelector
                    aria-label={t("settings:appearance_font_title")}
                    value={field.value}
                    onChange={(value) => {
                      field.onChange(value);
                      void save({ font: value });
                    }}
                  />
                </SettingRow>
              )}
            />
          </Card>
        </section>

        {!isMobile && (
          <section className="space-y-3">
            <SectionHeading title={t("settings:appearance_layout_title")} />
            <Card className="divide-y overflow-hidden">
              <SettingRow
                title={t("settings:appearance_navigation_title")}
                description={t("settings:appearance_navigation_description")}
              >
                <AnimatedToggleGroup<NavigationMode>
                  aria-label={t("settings:appearance_navigation_title")}
                  size="sm"
                  value={navigationMode}
                  onValueChange={setNavigationMode}
                  items={[
                    {
                      value: "sidebar",
                      label: (
                        <span className="flex items-center gap-1.5">
                          <Icons.PanelLeft className="size-3.5" />
                          {t("common:navStyle.sidebar")}
                        </span>
                      ),
                      "data-testid": "nav-sidebar-button",
                    },
                    {
                      value: "launchbar",
                      label: (
                        <span className="flex items-center gap-1.5">
                          <Icons.RectangleEllipsis className="size-3.5" />
                          {t("common:navStyle.floating")}
                        </span>
                      ),
                      "data-testid": "nav-launchbar-button",
                    },
                  ]}
                />
              </SettingRow>
              <FormField
                control={form.control}
                name="menuBarVisible"
                render={({ field }) => (
                  <SettingRow
                    title={t("settings:appearance_menu_bar")}
                    description={t("settings:appearance_menu_bar_description")}
                  >
                    <Switch
                      checked={field.value}
                      aria-label={t("settings:appearance_menu_bar")}
                      onCheckedChange={(value) => {
                        field.onChange(value);
                        void save({ menuBarVisible: value });
                      }}
                    />
                  </SettingRow>
                )}
              />
            </Card>
          </section>
        )}
      </div>
    </Form>
  );
}
