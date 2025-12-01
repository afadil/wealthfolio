import { useHapticFeedback, useIsMobileViewport } from "@/hooks";
import { cn } from "@/lib/utils";
import { Page, SwipableView, type Icon } from "@wealthfolio/ui";
import { motion } from "motion/react";
import * as React from "react";
import { useSearchParams } from "react-router-dom";

export interface SwipablePageView {
  value: string;
  label: string;
  icon?: Icon;
  content: React.ReactNode;
  /** Optional actions to display in the header when this view is active */
  actions?: React.ReactNode;
}

interface SwipablePageProps {
  views: SwipablePageView[];
  defaultView?: string;
  onViewChange?: (view: string) => void;
  className?: string;
  contentClassName?: string;
  withPadding?: boolean;
  title?: string;
}

// Navigation Pills Component - Segmented control style
function NavigationPills({
  views,
  currentView,
  onViewChange,
}: {
  views: SwipablePageView[];
  currentView: string;
  onViewChange: (view: string) => void;
}) {
  const layoutId = React.useId();

  return (
    <nav className="bg-muted/60 inline-flex items-center rounded-lg p-1">
      {views.map((view) => {
        const isActive = currentView === view.value;
        const IconComponent = view.icon;

        return (
          <button
            key={view.value}
            type="button"
            onClick={() => onViewChange(view.value)}
            className={cn(
              "relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground/80",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {isActive && (
              <motion.div
                layoutId={`nav-pill-${layoutId}`}
                className="bg-background absolute inset-0 rounded-md shadow-sm"
                initial={false}
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 35,
                }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              {IconComponent && <IconComponent className="size-4" />}
              <span>{view.label}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// Mobile Navigation - Clean pill navigation
function MobileNavigation({
  views,
  currentView,
  onViewChange,
}: {
  views: SwipablePageView[];
  currentView: string;
  onViewChange: (view: string) => void;
}) {
  const layoutId = React.useId();

  return (
    <div className="bg-muted/50 flex items-center gap-0.5 rounded-full p-1 backdrop-blur-sm">
      {views.map((item) => {
        const isActive = currentView === item.value;
        const IconComponent = item.icon;

        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onViewChange(item.value)}
            className={cn(
              "relative flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              isActive ? "text-foreground" : "text-muted-foreground",
            )}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
          >
            {isActive && (
              <motion.div
                layoutId={`mobile-nav-bg-${layoutId}`}
                className="bg-background absolute inset-0 rounded-full shadow-sm"
                initial={false}
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 35,
                }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {IconComponent && <IconComponent className="size-4" />}
              {isActive && <span>{item.label}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SwipablePage({
  views,
  defaultView,
  onViewChange,
  className,
  contentClassName,
  withPadding = true,
  title,
}: SwipablePageProps) {
  const isMobile = useIsMobileViewport();
  const [searchParams, setSearchParams] = useSearchParams();
  const hapticFeedback = useHapticFeedback();

  // Get current tab from URL, fallback to defaultView or first view
  const tabFromUrl = searchParams.get("tab");
  const currentView =
    tabFromUrl && views.some((v) => v.value === tabFromUrl)
      ? tabFromUrl
      : (defaultView ?? views[0]?.value);

  // Calculate numeric index for Embla
  const initialIndex = React.useMemo(() => {
    const idx = views.findIndex((v) => v.value === currentView);
    return idx === -1 ? 0 : idx;
  }, [currentView, views]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emblaApiRef = React.useRef<any>(null);

  // Sync Embla carousel when URL-derived currentView changes
  React.useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const api = emblaApiRef.current;
    if (api) {
      const targetIndex = views.findIndex((v) => v.value === currentView);
      if (targetIndex !== -1) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        api.scrollTo(targetIndex, true); // instant scroll on URL change
      }
    }
  }, [currentView, views]);

  const handleViewChange = React.useCallback(
    (nextView: string) => {
      if (nextView === currentView) {
        return;
      }

      if (isMobile) {
        hapticFeedback();
      }

      setSearchParams({ tab: nextView }, { replace: true });

      // Sync with SwipableView carousel
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const api = emblaApiRef.current;
      if (api) {
        const targetIndex = views.findIndex((v) => v.value === nextView);
        if (targetIndex !== -1) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          api.scrollTo(targetIndex);
        }
      }

      onViewChange?.(nextView);
    },
    [currentView, setSearchParams, onViewChange, views, isMobile, hapticFeedback],
  );

  return (
    <Page className={cn("flex h-full flex-col", className)}>
      <div
        data-ptr-content
        className={cn(
          "relative mx-auto flex w-full max-w-screen-2xl grow flex-col",
          contentClassName,
        )}
      >
        {isMobile ? (
          /* Mobile: SwipableView with navigation */
          <div className="flex h-full flex-col md:hidden">
            {/* Mobile Navigation at top */}
            <div className="pt-safe flex shrink-0 items-center justify-center pb-2">
              <MobileNavigation
                views={views}
                currentView={currentView}
                onViewChange={handleViewChange}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              <SwipableView
                initialIndex={initialIndex}
                items={views.map((v) => ({
                  name: v.label,
                  content: <div className={cn("pb-safe", withPadding && "p-2")}>{v.content}</div>,
                }))}
                displayToggle={false}
                onViewChange={(_index: number, name: string) => {
                  const matchedView = views.find((v) => v.label === name);
                  if (matchedView) {
                    handleViewChange(matchedView.value);
                  }
                }}
                onInit={(api) => {
                  if (api) {
                    emblaApiRef.current = api;
                  }
                }}
              />
            </div>
          </div>
        ) : (
          /* Desktop: Navigation at top center + content below */
          <div className="hidden h-full flex-col md:flex">
            {/* Header with Navigation and Actions */}
            <div className="flex shrink-0 items-center justify-between gap-4 px-2 pt-4 pb-3 lg:px-4">
              <div className="flex items-center gap-3">
                {title && <h1 className="text-muted-foreground text-sm font-medium">{title}</h1>}
                <NavigationPills
                  views={views}
                  currentView={currentView}
                  onViewChange={handleViewChange}
                />
              </div>
              {/* Actions slot - renders current view's actions */}
              <div className="flex items-center gap-2">
                {views.find((v) => v.value === currentView)?.actions}
              </div>
            </div>

            {/* Content - relative for absolute positioned actions within */}
            <div
              className={cn(
                "relative grow overflow-y-auto pt-8",
                withPadding && "px-2 pb-2 lg:px-4 lg:pb-4",
              )}
            >
              {views.find((v) => v.value === currentView)?.content}
            </div>
          </div>
        )}
      </div>
    </Page>
  );
}

export default SwipablePage;
