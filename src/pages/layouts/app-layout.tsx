import useNavigationEventListener from "@/hooks/use-navigation-event-listener";
import { useIsMobileViewport, usePlatform } from "@/hooks/use-platform";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";
import { MobileNavigationContainer } from "@/pages/layouts/mobile-navigation-container";
import { ErrorBoundary, Toaster } from "@wealthfolio/ui";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useNavigation } from "./navigation/app-navigation";
import { AppSidebar } from "./navigation/app-sidebar";
import { MobileNavBar } from "./navigation/mobile-navbar";

const AppLayout = () => {
  const { data: settings, isLoading: isSettingsLoading } = useSettings();
  const location = useLocation();
  const navigation = useNavigation();
  const { isMobile: isMobilePlatform } = usePlatform();
  const isMobileViewport = useIsMobileViewport();
  const shouldUseMobileNavigation = isMobilePlatform || isMobileViewport;

  // Setup navigation event listener for menu navigation
  useNavigationEventListener();

  if (isSettingsLoading) {
    return null;
  }

  // Redirect to onboarding if not completed, unless already there
  if (!settings?.onboardingCompleted && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" />;
  }

  return (
    <div className="app-shell bg-background text-foreground flex min-h-screen max-w-full overflow-x-hidden pt-10 lg:pt-2">
      <div className="scan-hide-target">
        <AppSidebar navigation={navigation} />
      </div>
      <div
        className={cn(
          "relative flex h-screen w-full max-w-full",
          shouldUseMobileNavigation ? "overflow-hidden" : "overflow-auto",
        )}
      >
        <ErrorBoundary>
          <main className="flex w-full max-w-full flex-1 flex-col overflow-hidden">
            <div data-tauri-drag-region="true" className="draggable h-6 w-full"></div>
            {shouldUseMobileNavigation ? (
              <div className="flex w-full flex-1">
                <MobileNavigationContainer />
              </div>
            ) : (
              <div className="momentum-scroll w-full max-w-full flex-1 overflow-auto scroll-smooth pb-16 md:pb-0">
                <Outlet />
              </div>
            )}
          </main>
        </ErrorBoundary>
      </div>
      {shouldUseMobileNavigation && <MobileNavBar navigation={navigation} />}
      <Toaster />
      {/* <TailwindIndicator /> */}
    </div>
  );
};

export { AppLayout };
