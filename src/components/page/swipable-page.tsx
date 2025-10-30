import { cn } from "@/lib/utils";
import { SwipableView } from "@wealthfolio/ui";
import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Page, PageContent, PageHeader } from "@wealthfolio/ui";

export interface SwipablePageView {
  value: string;
  label: string;
  content: React.ReactNode;
}

interface SwipablePageProps {
  views: SwipablePageView[];
  heading?: string;
  headingPrefix?: string;
  defaultView?: string;
  onViewChange?: (view: string) => void;
  actions?:
    | React.ReactNode
    | ((currentView: string, onViewChange: (view: string) => void) => React.ReactNode);
  showBackButton?: boolean;
  onBack?: () => void;
  showBorderOnScroll?: boolean;
  dragRegion?: boolean;
  isMobile?: boolean;
  className?: string;
  contentClassName?: string;
  withPadding?: boolean;
}

export function SwipablePage({
  views,
  heading,
  headingPrefix,
  defaultView,
  onViewChange,
  actions,
  showBackButton = false,
  onBack,
  showBorderOnScroll = true,
  dragRegion = true,
  isMobile = false,
  className,
  contentClassName,
  withPadding = true,
}: SwipablePageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);

  const initialView = (queryParams.get("tab") ?? defaultView ?? views[0]?.value) || views[0]?.value;
  const [currentView, setCurrentView] = React.useState<string>(initialView);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emblaApiRef = React.useRef<any>(null);

  const handleBackClick = React.useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    navigate(-1);
  }, [navigate, onBack]);

  const handleViewChange = React.useCallback(
    (nextView: string) => {
      if (nextView === currentView) {
        return;
      }

      setCurrentView(nextView);
      const url = `${location.pathname}?tab=${nextView}`;
      navigate(url, { replace: true });

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
    [currentView, location.pathname, navigate, onViewChange, views],
  );

  const headerActions = (
    <>
      {/* Mobile: Three-column layout - Empty | Centered Toggle | Actions */}
      <div className="grid w-full grid-cols-3 items-center md:hidden">
        {/* Empty left column for balance */}
        <div />

        {/* Centered Toggle Indicator with Dots */}
        <div className="flex items-center justify-center gap-3">
          {views.map((item) => (
            <React.Fragment key={item.value}>
              {currentView === item.value ? (
                /* Current View Label */
                <div
                  className="bg-muted/80 text-foreground rounded-full px-4 py-1.5 text-sm font-medium shadow-sm backdrop-blur-sm transition-all duration-300"
                  role="status"
                  aria-live="polite"
                >
                  {item.label}
                </div>
              ) : (
                /* Dot Navigation */
                <button
                  type="button"
                  onClick={() => handleViewChange(item.value)}
                  className="focus-visible:ring-ring bg-foreground/20 hover:bg-foreground/40 size-2 rounded-full transition-all duration-300 hover:scale-110 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                  aria-label={`Go to ${item.label}`}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Actions on the right */}
        {actions && (
          <div className="flex items-center justify-end gap-2">
            {typeof actions === "function" ? actions(currentView, handleViewChange) : actions}
          </div>
        )}
      </div>

      {/* Desktop: Actions only (no swipable view) */}
      <div className="hidden md:flex">
        {actions &&
          (typeof actions === "function" ? actions(currentView, handleViewChange) : actions)}
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
        {/* Mobile: SwipableView */}
        <div className="md:hidden">
          <SwipableView
            items={views.map((v) => ({ name: v.label, content: v.content }))}
            displayToggle={false}
            onViewChange={(_index: number, name: string) => {
              const matchedView = views.find((v) => v.label === name);
              if (matchedView) {
                handleViewChange(matchedView.value);
              }
            }}
            onInit={(api) => {
              if (api) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                emblaApiRef.current = api;
              }
            }}
          />
        </div>

        {/* Desktop: Show current view directly */}
        <div className={cn("hidden md:block", withPadding && "p-2 lg:p-4")}>
          {views.find((v) => v.value === currentView)?.content}
        </div>
      </PageContent>
    </Page>
  );
}

export default SwipablePage;
