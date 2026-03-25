import { Toaster } from "@/components/sonner";
import { AppLauncher } from "@/components/app-launcher";
import useNavigationEventListener from "@/hooks/use-navigation-event-listener";
import { useSettings } from "@/hooks/use-settings";
import { ApplicationShell, ErrorBoundary, PageScrollContainer } from "@wealthvn/ui";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useNavigation } from "./navigation/app-navigation";
import { AppSidebar } from "./navigation/app-sidebar";

const AppLayout = () => {
  const { data: settings, isLoading: isSettingsLoading } = useSettings();
  const location = useLocation();
  const navigation = useNavigation();

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

      <div className="relative flex min-h-0 w-full max-w-full flex-1 overflow-x-hidden">
        <ErrorBoundary>
          <main className="relative flex min-h-0 w-full max-w-full flex-1 flex-col overflow-x-hidden">
            <div
              data-tauri-drag-region="true"
              className="draggable pointer-events-auto absolute inset-x-0 top-0 z-50 h-6 cursor-grab opacity-0"
            ></div>
            <PageScrollContainer withMobileNavOffset={false}>
              <Outlet />
            </PageScrollContainer>
          </main>
        </ErrorBoundary>
      </div>

      <AppLauncher />
      <Toaster />
    </ApplicationShell>
  );
};

export { AppLayout };
