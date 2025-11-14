import AppLauncher from "@/components/app-launcher";
import { Toaster } from "@/components/sonner";
import useNavigationEventListener from "@/hooks/use-navigation-event-listener";
import { useIsMobileViewport, usePlatform } from "@/hooks/use-platform";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";
import { MobileNavigationContainer } from "@/pages/layouts/mobile-navigation-container";
import { ApplicationShell, ErrorBoundary, PageScrollContainer } from "@wealthfolio/ui";
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
    <ApplicationShell className="app-shell h-screen overflow-x-hidden">
      <div className="scan-hide-target">
        <AppSidebar navigation={navigation} />
      </div>

      <div
        className={cn(
          "relative flex min-h-0 w-full max-w-full flex-1 overflow-x-hidden",
          shouldUseMobileNavigation ? "overscroll-contain" : undefined,
        )}
      >
        <ErrorBoundary>
          <main className="relative flex min-h-0 w-full max-w-full flex-1 flex-col overflow-x-hidden">
            <div
              data-tauri-drag-region="true"
              className="draggable pointer-events-auto absolute inset-x-0 top-0 z-50 h-6 cursor-grab opacity-0"
            ></div>
            {shouldUseMobileNavigation ? (
              <MobileNavigationContainer />
            ) : (
              <PageScrollContainer withMobileNavOffset={false}>
                <Outlet />
              </PageScrollContainer>
            )}
          </main>
        </ErrorBoundary>
      </div>

      {shouldUseMobileNavigation && <MobileNavBar navigation={navigation} />}

      <Toaster mobileOffset={{ top: "68px" }} closeButton expand={false} />
      <AppLauncher />
    </ApplicationShell>
  );
};

export { AppLayout };
