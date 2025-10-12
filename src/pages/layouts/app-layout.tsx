import useNavigationEventListener from "@/hooks/use-navigation-event-listener";
import { useIsMobileViewport, usePlatform } from "@/hooks/use-platform";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";
import { MobileNavigationContainer } from "@/pages/layouts/mobile-navigation-container";
import { ApplicationShell, ErrorBoundary, Toaster } from "@wealthfolio/ui";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useNavigation } from "./navigation/app-navigation";
import { AppSidebar } from "./navigation/app-sidebar";
import { MobileNavBar } from "./navigation/mobile-navbar";

const AppLayout = () => {
  const { data: settings, isLoading: isSettingsLoading } = useSettings();
  const location = useLocation();
  const navigation = useNavigation();
  const { isMobile } = usePlatform();
  const isMobileViewport = useIsMobileViewport();
  const shouldUseMobileNavigation = isMobile || isMobileViewport;

  useNavigationEventListener();

  if (isSettingsLoading) return null;

  if (!settings?.onboardingCompleted && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" />;
  }

  return (
    <ApplicationShell className="app-shells lg:pt-2">
      <div className="scan-hide-target">
        <AppSidebar navigation={navigation} />
      </div>

      <div
        className={cn(
          "relative flex min-h-0 w-full max-w-full flex-1 overflow-hidden",
          shouldUseMobileNavigation ? "overscroll-contain" : undefined,
        )}
      >
        <ErrorBoundary>
          <main className="relative flex min-h-0 w-full max-w-full flex-1 flex-col overflow-hidden">
            <div
              data-tauri-drag-region="true"
              className="draggable pointer-events-auto absolute inset-x-0 top-0 h-6 opacity-0"
            ></div>

            {shouldUseMobileNavigation ? (
              <MobileNavigationContainer />
            ) : (
              <div className="momentum-scroll scroll-pb-nav w-full max-w-full flex-1 overflow-auto">
                <Outlet />
              </div>
            )}
          </main>
        </ErrorBoundary>
      </div>

      {shouldUseMobileNavigation && <MobileNavBar navigation={navigation} />}

      <Toaster />
    </ApplicationShell>
  );
};

export { AppLayout };
