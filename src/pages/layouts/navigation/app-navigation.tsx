import { getDynamicNavItems, subscribeToNavigationUpdates } from "@/addons/addons-runtime-context";
import { Icons } from "@/components/ui/icons";
import { useEffect, useState } from "react";

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

const staticNavigation: NavigationProps = {
  primary: [
    {
      icon: <Icons.Dashboard className="size-6" />,
      title: "Dashboard",
      href: "/dashboard",
    },
    {
      icon: <Icons.Holdings className="size-6" />,
      title: "Holdings",
      href: "/holdings",
    },
    {
      icon: <Icons.Performance className="size-6" />,
      title: "Performance",
      href: "/performance",
    },
    {
      icon: <Icons.Income className="size-6" />,
      title: "Income",
      href: "/income",
    },
    {
      icon: <Icons.Activity className="size-6" />,
      title: "Activities",
      href: "/activities",
    },
  ],
  secondary: [
    {
      icon: <Icons.Settings className="size-6" />,
      title: "Settings",
      href: "/settings",
    },
  ],
};

export function useNavigation() {
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
