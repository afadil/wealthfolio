import { cn } from "@/lib/utils";
import { SwipableView } from "@wealthfolio/ui";
import * as React from "react";
import { Outlet, matchPath, useLocation, useNavigate } from "react-router-dom";
import { Page, PageContent, PageHeader } from "@wealthfolio/ui";

export interface SwipableRoute {
  path: string;
  label: string;
  element: React.ReactNode;
}

interface SwipableRoutesPageProps {
  routes: SwipableRoute[];
  basePath: string;
  heading?: string;
  headingPrefix?: string;
  actions?:
    | React.ReactNode
    | ((currentPath: string, onNavigate: (path: string) => void) => React.ReactNode);
  showBackButton?: boolean;
  onBack?: () => void;
  showBorderOnScroll?: boolean;
  dragRegion?: boolean;
  isMobile?: boolean;
  className?: string;
  contentClassName?: string;
  withPadding?: boolean;
}

export function SwipableRoutesPage({
  routes,
  basePath,
  heading,
  headingPrefix,
  actions,
  showBackButton = false,
  onBack,
  showBorderOnScroll = true,
  dragRegion = true,
  isMobile = false,
  className,
  contentClassName,
  withPadding = true,
}: SwipableRoutesPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emblaApiRef = React.useRef<any>(null);

  const handleBackClick = React.useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    navigate(-1);
  }, [navigate, onBack]);

  // Track which routes have been swiped to (for lazy mounting)
  const [visitedIndices, setVisitedIndices] = React.useState<Set<number>>(() => new Set([0]));

  // Track Embla's selected index for proper dot navigation
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  // Find current route index
  const currentRouteIndex = React.useMemo(() => {
    const index = routes.findIndex((route) =>
      matchPath(
        {
          path: `${basePath}/${route.path}`,
          end: true,
        },
        location.pathname,
      ),
    );
    return index !== -1 ? index : 0;
  }, [location.pathname, routes, basePath]);

  const currentRoute = routes[currentRouteIndex];

  // Memoize swipable items with lazy mounting
  const swipableItems = React.useMemo(() => {
    return routes.map((route, index) => ({
      name: route.label,
      content: visitedIndices.has(index) ? route.element : null,
    }));
  }, [routes, visitedIndices]);

  const handleNavigate = React.useCallback(
    (path: string) => {
      const fullPath = `${basePath}/${path}`;
      if (location.pathname === fullPath) {
        return;
      }

      navigate(fullPath, { replace: false });

      // Sync with SwipableView carousel
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const api = emblaApiRef.current;
      if (api) {
        const targetIndex = routes.findIndex((r) => r.path === path);
        if (targetIndex !== -1) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          api.scrollTo(targetIndex);
        }
      }
    },
    [location.pathname, navigate, routes, basePath],
  );

  const handleSwipe = React.useCallback(
    (index: number) => {
      // Mark this index as visited for lazy mounting
      setVisitedIndices((prev) => {
        if (prev.has(index)) return prev;
        const newSet = new Set(prev);
        newSet.add(index);
        return newSet;
      });

      const targetRoute = routes[index];
      if (targetRoute && currentRouteIndex !== index) {
        handleNavigate(targetRoute.path);
      }
    },
    [routes, currentRouteIndex, handleNavigate],
  );

  // Sync Embla API when route changes externally (e.g., direct navigation)
  React.useEffect(() => {
    // Mark the current route as visited when navigating directly
    setVisitedIndices((prev) => {
      if (prev.has(currentRouteIndex)) return prev;
      const newSet = new Set(prev);
      newSet.add(currentRouteIndex);
      return newSet;
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const api = emblaApiRef.current;
    if (api) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      api.scrollTo(currentRouteIndex);
    }
  }, [currentRouteIndex]);

  const headerActions = (
    <>
      {/* Mobile: Actions only (toggle is below header) */}
      {actions && (
        <div className="flex items-center gap-2 md:hidden">
          {typeof actions === "function"
            ? actions(currentRoute?.path ?? "", handleNavigate)
            : actions}
        </div>
      )}

      {/* Desktop: Actions only (no swipable view) */}
      <div className="hidden md:flex">
        {actions &&
          (typeof actions === "function"
            ? actions(currentRoute?.path ?? "", handleNavigate)
            : actions)}
      </div>
    </>
  );

  return (
    <Page className={className}>
      <PageHeader
        heading={!isMobile ? heading : undefined}
        headingPrefix={headingPrefix}
        onBack={showBackButton ? handleBackClick : undefined}
        showBorderOnScroll={showBorderOnScroll}
        dragRegion={dragRegion}
        actions={headerActions}
      />

      <PageContent withPadding={false} className={contentClassName}>
        {/* Mobile: Toggle Indicator + SwipableView */}
        <div className="md:hidden">
          {/* Centered Toggle Indicator with Dots */}
          <div className="flex items-center justify-center gap-3 py-3">
            {routes.map((route, index) => {
              const isActive = selectedIndex === index;
              return (
                <React.Fragment key={route.path}>
                  {isActive ? (
                    /* Current View Label */
                    <div
                      className="bg-muted/80 text-foreground rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap shadow-sm backdrop-blur-sm transition-all duration-300"
                      role="status"
                      aria-live="polite"
                    >
                      {route.label}
                    </div>
                  ) : (
                    /* Dot Navigation */
                    <button
                      type="button"
                      onClick={() => handleNavigate(route.path)}
                      className="focus-visible:ring-ring bg-foreground/20 hover:bg-foreground/40 size-2 flex-shrink-0 rounded-full transition-all duration-300 hover:scale-110 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                      aria-label={`Go to ${route.label}`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Swipable Content */}
          <SwipableView
            items={swipableItems}
            displayToggle={false}
            onViewChange={handleSwipe}
            onInit={(api) => {
              if (api) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                emblaApiRef.current = api;

                // Initialize selected index
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                setSelectedIndex(api.selectedScrollSnap() as number);

                // Set up event listeners for tracking selection
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                api.on("select", () => {
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                  setSelectedIndex(api.selectedScrollSnap() as number);
                });

                // Scroll to current route on init
                if (currentRouteIndex > 0) {
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                  api?.scrollTo(currentRouteIndex);
                }
              }
            }}
          />
        </div>

        {/* Desktop: Use React Router's Outlet */}
        <div className={cn("hidden md:block", withPadding && "p-2 lg:p-4")}>
          <Outlet />
        </div>
      </PageContent>
    </Page>
  );
}

export default SwipableRoutesPage;
