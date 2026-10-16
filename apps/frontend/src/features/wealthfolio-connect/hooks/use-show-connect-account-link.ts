import { isTauri } from "@/adapters";
import { usePlatform } from "@/hooks/use-platform";
import { isSubscriptionStatusActive } from "../lib/plan-capabilities";
import { useWealthfolioConnect } from "../providers/wealthfolio-connect-provider";

/**
 * Whether to show the discreet "Connect account" links: Connect is reachable,
 * the user is not syncing yet, and this is the desktop app or the web build.
 */
export function useShowConnectAccountLink(): boolean {
  const { isMobile, loading: isPlatformLoading } = usePlatform();
  const {
    isEnabled,
    isConnected,
    isInitializing,
    isLoadingUserInfo,
    isSessionUnavailable,
    userInfo,
    error,
  } = useWealthfolioConnect();

  if (isPlatformLoading || (isTauri && isMobile)) return false;

  return (
    isEnabled &&
    !isInitializing &&
    !isLoadingUserInfo &&
    !isSessionUnavailable &&
    !error &&
    (!isConnected ||
      (!!userInfo && !isSubscriptionStatusActive(userInfo.team?.subscription_status)))
  );
}
