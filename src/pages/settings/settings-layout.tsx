import { Icons } from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";
import { ApplicationShell } from "@wealthvn/ui";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { SidebarNav } from "./sidebar-nav";

export default function SettingsLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation("settings");

  const sidebarNavItems = [
    {
      title: t("navigation.general.title"),
      href: "general",
      subtitle: t("navigation.general.subtitle"),
      icon: <Icons.Settings className="h-5 w-5" />,
    },
    {
      title: t("navigation.appearance.title"),
      href: "appearance",
      subtitle: t("navigation.appearance.subtitle"),
      icon: <Icons.Monitor className="h-5 w-5" />,
    },
    {
      title: t("navigation.accounts.title"),
      href: "accounts",
      subtitle: t("navigation.accounts.subtitle"),
      icon: <Icons.CreditCard className="h-5 w-5" />,
    },
    {
      title: t("navigation.limits.title"),
      href: "contribution-limits",
      subtitle: t("navigation.limits.subtitle"),
      icon: <Icons.TrendingUp className="h-5 w-5" />,
    },
    {
      title: t("navigation.goals.title"),
      href: "goals",
      subtitle: t("navigation.goals.subtitle"),
      icon: <Icons.Goal className="h-5 w-5" />,
    },
    {
      title: t("navigation.marketData.title"),
      href: "market-data",
      subtitle: t("navigation.marketData.subtitle"),
      icon: <Icons.BarChart className="h-5 w-5" />,
    },
    {
      title: t("navigation.securities.title"),
      href: "securities",
      subtitle: t("navigation.securities.subtitle"),
      icon: <Icons.BadgeDollarSign className="h-5 w-5" />,
    },
    // {
    //   title: t("navigation.addons.title"),
    //   href: "addons",
    //   subtitle: t("navigation.addons.subtitle"),
    //   icon: <Icons.Package className="h-5 w-5" />,
    // },
    // {
    //   title: "Sync",
    //   href: "sync",
    //   subtitle: "Sync between devices",
    //   icon: <Icons.Smartphone className="h-5 w-5" />,
    // },
    {
      title: t("navigation.exports.title"),
      href: "exports",
      subtitle: t("navigation.exports.subtitle"),
      icon: <Icons.Download className="h-5 w-5" />,
    },
    {
      title: t("navigation.about.title"),
      href: "about",
      subtitle: t("navigation.about.subtitle"),
      icon: <Icons.InfoCircle className="h-5 w-5" />,
    },
  ];

  // Check if we're on the main settings page (mobile) or a specific setting page
  const isMainSettingsPage =
    location.pathname === "/settings" || location.pathname === "/settings/";

  // Mobile-first: show list view on main page, detail view on specific pages
  return (
    <ApplicationShell className="settings-root app-shell h-screen overflow-x-hidden">
      {/* Mobile Layout */}
      <div className="w-full lg:hidden">
        {isMainSettingsPage ? (
          // Mobile Settings List View (carded list with dividers)
          <div className="scan-hide-target w-full max-w-full overflow-x-hidden">
            <div className="bg-background/95 supports-backdrop-filter:bg-background/60 pt-safe sticky top-0 z-10 border-b backdrop-blur">
              <div className="flex min-h-[60px] items-center justify-center px-4">
                <h1 className="text-lg font-semibold">{t("title")}</h1>
              </div>
            </div>
            <div className="p-3 lg:p-4">
              <div className="divide-border bg-card divide-y overflow-hidden rounded-2xl border shadow-sm">
                {sidebarNavItems.map((item) => (
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
          </div>
        ) : (
          <div className="scan-hide-target pt-safe w-full max-w-full overflow-x-hidden">
            <div className="w-full max-w-full overflow-x-hidden scroll-smooth">
              <div className="p-2 lg:p-4">
                <Outlet />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Layout */}
      <div className="hidden lg:flex lg:w-full lg:justify-start">
        <div className="flex w-full max-w-6xl flex-col px-2 py-8">
          <div className="space-y-0.5">
            <h2 className="text-2xl font-bold tracking-tight">{t("title")}</h2>
          </div>
          <Separator className="my-6" />
          <div className="flex gap-10">
            <aside className="hidden w-[240px] shrink-0 lg:sticky lg:top-24 lg:flex lg:flex-col lg:self-start">
              <SidebarNav items={sidebarNavItems} />
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
