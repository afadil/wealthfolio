"use client";

import { cn } from "@/lib/utils";
import useEmblaCarousel, { type UseEmblaCarouselType } from "embla-carousel-react";
import * as React from "react";

type CarouselApi = UseEmblaCarouselType[1];

export interface SwipableViewItem {
  name: string;
  content: React.ReactNode;
}

export interface SwipableViewProps {
  items: SwipableViewItem[];
  displayToggle?: boolean;
  className?: string;
  dotClassName?: string;
  labelClassName?: string;
  onViewChange?: (index: number, name: string) => void;
  onInit?: (api: CarouselApi) => void;
}

export function SwipableView({
  items,
  displayToggle = false,
  className,
  dotClassName,
  labelClassName,
  onViewChange,
  onInit: onInitProp,
}: SwipableViewProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: "start",
    skipSnaps: false,
    dragFree: false,
  });

  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [scrollSnaps, setScrollSnaps] = React.useState<number[]>([]);
  const previousIndexRef = React.useRef<number>(0);

  const scrollTo = React.useCallback((index: number) => emblaApi && emblaApi.scrollTo(index), [emblaApi]);

  const onSelect = React.useCallback(
    (api: CarouselApi) => {
      if (!api) return;
      const index = api.selectedScrollSnap();
      setSelectedIndex(index);

      // Only call onViewChange if the index actually changed
      if (index !== previousIndexRef.current) {
        previousIndexRef.current = index;
        onViewChange?.(index, items[index]?.name || "");
      }
    },
    [items, onViewChange],
  );

  const onInit = React.useCallback(
    (api: CarouselApi) => {
      if (!api) return;
      setScrollSnaps(api.scrollSnapList());
      onInitProp?.(api);
    },
    [onInitProp],
  );

  React.useEffect(() => {
    if (!emblaApi) return;

    onInit(emblaApi);
    onSelect(emblaApi);
    emblaApi.on("reInit", onInit);
    emblaApi.on("reInit", onSelect);
    emblaApi.on("select", onSelect);

    return () => {
      emblaApi.off("reInit", onInit);
      emblaApi.off("reInit", onSelect);
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onInit, onSelect]);

  return (
    <div className={cn("relative w-full", className)}>
      {/* Navigation Toggle */}
      {displayToggle && items.length > 1 && (
        <div className="flex items-center justify-center gap-3 py-2.5">
          {scrollSnaps.map((_, index) => (
            <React.Fragment key={index}>
              {selectedIndex === index ? (
                /* Current View Label */
                <div
                  className={cn(
                    "bg-muted/80 rounded-full px-4 py-1.5 backdrop-blur-sm",
                    "text-foreground text-sm font-medium",
                    "transition-all duration-300",
                    "shadow-sm",
                    labelClassName,
                  )}
                  role="status"
                  aria-live="polite"
                >
                  {items[selectedIndex]?.name || `View ${selectedIndex + 1}`}
                </div>
              ) : (
                /* Dot Navigation */
                <button
                  type="button"
                  onClick={() => scrollTo(index)}
                  className={cn(
                    "size-2 rounded-full transition-all duration-300",
                    "focus-visible:ring-ring hover:scale-110 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                    "bg-foreground/20 hover:bg-foreground/40",
                    dotClassName,
                  )}
                  aria-label={`Go to ${items[index]?.name || `view ${index + 1}`}`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Swipable Content */}
      <div ref={emblaRef} className="overflow-hidden">
        <div
          className="flex touch-pan-y"
          style={{
            overflowX: "visible",
          }}
        >
          {items.map((item, index) => (
            <div key={index} className="min-w-0 shrink-0 grow-0 basis-full">
              {item.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
