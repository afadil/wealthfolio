import { getDynamicNavItems, subscribeToNavigationUpdates } from "@/addons/addons-runtime-context";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import type { TFunction } from "i18next";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

export interface NavLink {
  title: string;
  href: string;
  icon?: React.ReactNode;
  keywords?: string[];
  label?: string; // Optional descriptive label for launcher/search
}

export interface NavigationProps {
  primary: NavLink[];
  secondary?: NavLink[];
  addons?: NavLink[];
}

/** Primary + secondary items; covered by `app-navigation.contract.test.ts` for key routes. */
export function createStaticNavigation(t: TFunction<"common">): NavigationProps {
  return {
    primary: [
      {
        icon: <Icons.Dashboard className="size-6" />,
        title: t("nav.primary.dashboard.title"),
        href: "/dashboard",
        keywords: ["home", "overview", "summary"],
        label: t("nav.primary.dashboard.label"),
      },
      {
        icon: <Icons.Insight className="size-6" />,
        title: t("nav.primary.insights.title"),
        href: "/insights",
        keywords: ["insights", "Analytics"],
        label: t("nav.primary.insights.label"),
      },
      {
        icon: <Icons.Holdings className="size-6" />,
        title: t("nav.primary.holdings.title"),
        href: "/holdings",
        keywords: ["Holdings", "portfolio", "assets", "positions", "stocks"],
        label: t("nav.primary.holdings.label"),
      },
      {
        icon: <Icons.Activity className="size-6" />,
        title: t("nav.primary.activities.title"),
        href: "/activities",
        keywords: ["transactions", "trades", "history"],
        label: t("nav.primary.activities.label"),
      },
      {
        icon: <Icons.Target className="size-6" />,
        title: t("nav.primary.fire_planner.title"),
        href: "/fire-planner",
        keywords: ["fire", "retire", "retirement", "financial independence", "planner"],
        label: t("nav.primary.fire_planner.label"),
      },
      {
        icon: <Icons.Sparkles className="size-6" />,
        title: t("nav.primary.assistant.title"),
        href: "/assistant",
        keywords: ["ai", "assistant", "chat", "help", "ask"],
        label: t("nav.primary.assistant.label"),
      },
    ],
    secondary: [
      {
        icon: <Icons.Settings className="size-6" />,
        title: t("nav.secondary.settings.title"),
        href: "/settings",
        keywords: ["preferences", "config", "configuration"],
      },
    ],
  };
}

export function useNavigation() {
  const { t } = useTranslation("common");
  const [dynamicItems, setDynamicItems] = useState<NavigationProps["addons"]>([]);

  const staticNav = useMemo(() => createStaticNavigation(t), [t]);

  // Subscribe to navigation updates from addons
  useEffect(() => {
    const updateDynamicItems = () => {
      const itemsFromRuntime = getDynamicNavItems();
      setDynamicItems(itemsFromRuntime);
    };

    // Initial load
    updateDynamicItems();

    // Subscribe to updates
    const unsubscribe = subscribeToNavigationUpdates(updateDynamicItems);

    return () => {
      unsubscribe();
    };
  }, []);

  // Combine static navigation items with addons grouped separately
  const navigation: NavigationProps = useMemo(
    () => ({
      primary: staticNav.primary,
      secondary: staticNav.secondary,
      addons: dynamicItems,
    }),
    [staticNav, dynamicItems],
  );

  return navigation;
}

export function isPathActive(pathname: string, href: string): boolean {
  if (!href) {
    return false;
  }

  const ensureLeadingSlash = href.startsWith("/") ? href : `/${href}`;
  const normalize = (value: string) => {
    if (value.length > 1 && value.endsWith("/")) {
      return value.slice(0, -1);
    }
    return value;
  };

  const normalizedHref = normalize(ensureLeadingSlash);
  const normalizedPath = normalize(pathname);

  if (normalizedHref === "/") {
    return normalizedPath === "/";
  }

  // Dashboard and Net Worth are grouped together
  if (normalizedHref === "/dashboard") {
    return (
      normalizedPath === "/" || normalizedPath === "/dashboard" || normalizedPath === "/net-worth"
    );
  }

  return normalizedPath === normalizedHref || normalizedPath.startsWith(`${normalizedHref}/`);
}
