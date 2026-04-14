import { ApplicationShell } from "@wealthfolio/ui";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { SidebarNav } from "./sidebar-nav";

type NavItemDef = {
  href: string;
  titleKey: string;
  subtitleKey: string;
  icon: ReactNode;
};

type SectionDef = {
  sectionKey: string;
  items: NavItemDef[];
};

export function buildSettingsSections(): SectionDef[] {
  return [
    {
      sectionKey: "settings.nav.section.preferences",
      items: [
        {
          titleKey: "settings.nav.general.title",
          href: "general",
          subtitleKey: "settings.nav.general.subtitle",
          icon: <Icons.Settings2 className="size-5" />,
        },
        {
          titleKey: "settings.nav.appearance.title",
          href: "appearance",
          subtitleKey: "settings.nav.appearance.subtitle",
          icon: <Icons.Monitor className="size-5" />,
        },
        {
          titleKey: "settings.nav.research_links.title",
          href: "research-links",
          subtitleKey: "settings.nav.research_links.subtitle",
          icon: <Icons.Link className="size-5" />,
        },
      ],
    },
    {
      sectionKey: "settings.nav.section.portfolio",
      items: [
        {
          titleKey: "settings.nav.accounts.title",
          href: "accounts",
          subtitleKey: "settings.nav.accounts.subtitle",
          icon: <Icons.CreditCard className="size-5" />,
        },
        {
          titleKey: "settings.nav.goals.title",
          href: "goals",
          subtitleKey: "settings.nav.goals.subtitle",
          icon: <Icons.Goal className="size-5" />,
        },
        {
          titleKey: "settings.nav.fire_planner.title",
          href: "fire-planner",
          subtitleKey: "settings.nav.fire_planner.subtitle",
          icon: <Icons.Target className="size-5" />,
        },
        {
          titleKey: "settings.nav.contribution_limits.title",
          href: "contribution-limits",
          subtitleKey: "settings.nav.contribution_limits.subtitle",
          icon: <Icons.TrendingUp className="size-5" />,
        },
      ],
    },
    {
      sectionKey: "settings.nav.section.data",
      items: [
        {
          titleKey: "settings.nav.securities.title",
          href: "securities",
          subtitleKey: "settings.nav.securities.subtitle",
          icon: <Icons.BadgeDollarSign className="size-5" />,
        },
        {
          titleKey: "settings.nav.taxonomies.title",
          href: "taxonomies",
          subtitleKey: "settings.nav.taxonomies.subtitle",
          icon: <Icons.Blocks className="size-5" />,
        },
        {
          titleKey: "settings.nav.exports.title",
          href: "exports",
          subtitleKey: "settings.nav.exports.subtitle",
          icon: <Icons.Download className="size-5" />,
        },
      ],
    },
    {
      sectionKey: "settings.nav.section.connections",
      items: [
        {
          titleKey: "settings.nav.connect.title",
          href: "connect",
          subtitleKey: "settings.nav.connect.subtitle",
          icon: <Icons.CloudSync2 className="size-6 text-blue-400" />,
        },
        {
          titleKey: "settings.nav.market_data.title",
          href: "market-data",
          subtitleKey: "settings.nav.market_data.subtitle",
          icon: <Icons.BarChart className="size-5" />,
        },
        {
          titleKey: "settings.nav.ai_providers.title",
          href: "ai-providers",
          subtitleKey: "settings.nav.ai_providers.subtitle",
          icon: <Icons.SparklesOutline className="size-5" />,
        },
      ],
    },
    {
      sectionKey: "settings.nav.section.extensions",
      items: [
        {
          titleKey: "settings.nav.addons.title",
          href: "addons",
          subtitleKey: "settings.nav.addons.subtitle",
          icon: <Icons.Package className="size-5" />,
        },
      ],
    },
    {
      sectionKey: "settings.nav.section.about",
      items: [
        {
          titleKey: "settings.nav.about.title",
          href: "about",
          subtitleKey: "settings.nav.about.subtitle",
          icon: <Icons.InfoCircle className="size-5" />,
        },
      ],
    },
  ];
}

export default function SettingsLayout() {
  const { t } = useTranslation("common");
  const location = useLocation();
  const navigate = useNavigate();

  const sectionDefs = useMemo(() => buildSettingsSections(), []);

  const settingsSections = useMemo(
    () =>
      sectionDefs.map((section) => ({
        title: t(section.sectionKey),
        items: section.items.map((item) => ({
          href: item.href,
          title: t(item.titleKey),
          subtitle: t(item.subtitleKey),
          icon: item.icon,
        })),
      })),
    [sectionDefs, t],
  );

  const isMainSettingsPage =
    location.pathname === "/settings" || location.pathname === "/settings/";

  return (
    <ApplicationShell className="settings-root app-shell h-screen overflow-x-hidden">
      <div className="w-full lg:hidden">
        {isMainSettingsPage ? (
          <div className="scan-hide-target w-full max-w-full overflow-x-hidden">
            <div className="bg-background/95 supports-backdrop-filter:bg-background/60 pt-safe sticky top-0 z-10 border-b backdrop-blur">
              <div className="flex min-h-[60px] items-center justify-center px-4">
                <h1 className="text-lg font-semibold">{t("settings.layout.title")}</h1>
              </div>
            </div>
            <div className="space-y-6 p-3 pb-[calc(var(--mobile-nav-ui-height)+max(var(--mobile-nav-gap),env(safe-area-inset-bottom)))] lg:p-4 lg:pb-4">
              {settingsSections.map((section) => (
                <div key={section.title} className="space-y-3">
                  <div className="text-muted-foreground px-2 text-xs font-semibold uppercase tracking-widest">
                    {section.title}
                  </div>
                  <div className="divide-border bg-card divide-y overflow-hidden rounded-2xl border shadow-sm">
                    {section.items.map((item) => (
                      <button
                        key={item.href}
                        onClick={() => navigate(item.href)}
                        className="hover:bg-muted/40 flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors active:opacity-90"
                        aria-label={item.title}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="text-muted-foreground shrink-0">{item.icon}</div>
                          <div className="min-w-0">
                            <div className="text-foreground truncate text-base font-medium">
                              {item.title}
                            </div>
                            {item?.subtitle && (
                              <div className="text-muted-foreground truncate text-sm">
                                {item.subtitle}
                              </div>
                            )}
                          </div>
                        </div>
                        <Icons.ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="scan-hide-target pt-safe w-full max-w-full overflow-x-hidden">
            <div className="w-full max-w-full overflow-x-hidden scroll-smooth">
              <div className="p-2 pb-[calc(var(--mobile-nav-ui-height)+max(var(--mobile-nav-gap),env(safe-area-inset-bottom)))] lg:p-4 lg:pb-4">
                <Outlet />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="hidden lg:flex lg:w-full lg:justify-start">
        <div className="flex w-full max-w-6xl flex-col px-2 py-8">
          <div className="space-y-0.5">
            <h2 className="text-2xl font-bold tracking-tight">{t("settings.layout.title")}</h2>
          </div>
          <Separator className="my-6" />
          <div className="flex gap-10">
            <aside className="hidden w-[240px] shrink-0 lg:sticky lg:top-24 lg:flex lg:flex-col lg:self-start">
              <div className="space-y-6">
                {settingsSections.map((section) => (
                  <div key={section.title} className="space-y-2">
                    <div className="text-muted-foreground pl-2 text-sm font-light uppercase tracking-widest">
                      {section.title}
                    </div>
                    <SidebarNav items={section.items} />
                  </div>
                ))}
              </div>
            </aside>
            <div className="mb-8 min-w-0 flex-1">
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </ApplicationShell>
  );
}
