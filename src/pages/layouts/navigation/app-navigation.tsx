import { getDynamicNavItems, subscribeToNavigationUpdates } from "@/addons/addons-runtime-context";
import { Icons } from "@/components/ui/icons";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export interface NavLink {
  title: string;
  href: string;
  icon?: React.ReactNode;
}

export interface NavigationProps {
  primary: NavLink[];
  secondary?: NavLink[];
  addons?: NavLink[];
}

export function useNavigation() {
  const { t } = useTranslation("common");
  const [dynamicItems, setDynamicItems] = useState<NavigationProps["primary"]>([]);

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

  // Build static navigation with translations
  const staticNavigation: NavigationProps = {
    primary: [
      {
        icon: <Icons.Dashboard className="size-6" />,
        title: t("navigation.dashboard"),
        href: "/dashboard",
      },
      {
        icon: <Icons.Goal className="size-6" />,
        title: t("navigation.goals"),
        href: "/goals",
      },
      {
        icon: <Icons.Holdings className="size-6" />,
        title: t("navigation.holdings"),
        href: "/holdings",
      },
      {
        icon: <Icons.Performance className="size-6" />,
        title: t("navigation.performance"),
        href: "/performance",
      },
      {
        icon: <Icons.Trading className="size-6" />,
        title: t("navigation.trading"),
        href: "/trading",
      },
      {
        icon: <Icons.Activity className="size-6" />,
        title: t("navigation.activities"),
        href: "/activities",
      },
    ],
    secondary: [
      {
        icon: <Icons.Settings className="size-6" />,
        title: t("navigation.settings"),
        href: "/settings",
      },
    ],
  };

  // Combine static navigation items with addons grouped separately
  const navigation: NavigationProps = {
    primary: staticNavigation.primary,
    secondary: staticNavigation.secondary,
    addons: dynamicItems,
  };

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

  return normalizedPath === normalizedHref || normalizedPath.startsWith(`${normalizedHref}/`);
}
