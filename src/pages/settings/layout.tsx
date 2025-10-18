import { Icons } from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";
import { ApplicationShell } from "@wealthfolio/ui";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { SidebarNav } from "./sidebar-nav";

const sidebarNavItems = [
  {
    title: "General",
    href: "general",
    subtitle: "Currency and general preferences",
    icon: <Icons.Settings className="h-5 w-5" />,
  },
  {
    title: "Appearance",
    href: "appearance",
    subtitle: "Theme, typography, and density",
    icon: <Icons.Monitor className="h-5 w-5" />,
  },
  {
    title: "Accounts",
    href: "accounts",
    subtitle: "Investment and savings accounts",
    icon: <Icons.CreditCard className="h-5 w-5" />,
  },
  {
    title: "Limits",
    href: "contribution-limits",
    subtitle: "Contribution limits and rules",
    icon: <Icons.TrendingUp className="h-5 w-5" />,
  },
  {
    title: "Goals",
    href: "goals",
    subtitle: "Plan and track objectives",
    icon: <Icons.Goal className="h-5 w-5" />,
  },
  {
    title: "Market Data",
    href: "market-data",
    subtitle: "Providers and data update",
    icon: <Icons.BarChart className="h-5 w-5" />,
  },

  {
    title: "Add-ons",
    href: "addons",
    subtitle: "Extend Wealthfolio with features",
    icon: <Icons.Package className="h-5 w-5" />,
  },
  // {
  //   title: "Sync",
  //   href: "sync",
  //   subtitle: "Sync between devices",
  //   icon: <Icons.Smartphone className="h-5 w-5" />,
  // },
  {
    title: "Data Export",
    href: "exports",
    subtitle: "Backup and export your data",
    icon: <Icons.Download className="h-5 w-5" />,
  },
  {
    title: "About",
    href: "about",
    subtitle: "About Wealthfolio",
    icon: <Icons.InfoCircle className="h-5 w-5" />,
  },
];

export default function SettingsLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  // Check if we're on the main settings page (mobile) or a specific setting page
  const isMainSettingsPage =
    location.pathname === "/settings" || location.pathname === "/settings/";

  // Mobile-first: show list view on main page, detail view on specific pages
  return (
    <ApplicationShell className="settings-root">
      {/* Mobile Layout */}
      <div className="lg:hidden">
        {isMainSettingsPage ? (
          // Mobile Settings List View (carded list with dividers)
          <div className="scan-hide-target w-full max-w-full overflow-x-hidden">
            <div className="bg-background/95 supports-backdrop-filter:bg-background/60 sticky top-0 z-10 border-b backdrop-blur">
              <div className="flex min-h-[60px] items-center justify-center px-4">
                <h1 className="text-lg font-semibold">Settings</h1>
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
          <div className="scan-hide-target w-full max-w-full overflow-x-hidden">
            <div className="w-full max-w-full overflow-x-hidden scroll-smooth">
              <div className="p-2 lg:p-4">
                <Outlet />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Layout */}
      <div className="mx-2 hidden lg:block">
        <div className="space-y-0.5">
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        </div>
        <Separator className="my-6" />
        <div className="flex flex-col space-y-8 lg:grid lg:grid-cols-[220px_1fr] lg:gap-10 lg:space-y-0">
          <aside className="lg:w-sidebar lg:sticky lg:top-20 lg:self-start lg:pr-4">
            <SidebarNav items={sidebarNavItems} />
          </aside>
          <div className="mx-12 min-w-0 flex-1 lg:max-w-4xl">
            <Outlet />
          </div>
        </div>
      </div>
    </ApplicationShell>
  );
}
