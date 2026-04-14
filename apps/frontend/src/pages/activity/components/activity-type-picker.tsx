import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@wealthfolio/ui/components/ui/carousel";
import { Icons, type IconName } from "@wealthfolio/ui/components/ui/icons";
import { cn } from "@/lib/utils";

export type PrimaryActivityType =
  | "BUY"
  | "SELL"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "DIVIDEND"
  | "TRANSFER";
export type SecondaryActivityType = "SPLIT" | "FEE" | "INTEREST" | "TAX";
export type ActivityType = PrimaryActivityType | SecondaryActivityType;

interface ActivityTypeConfig<T extends string> {
  value: T;
  icon: IconName;
}

type ResolvedActivityType = ActivityTypeConfig<ActivityType> & { label: string };

const PRIMARY_ACTIVITY_TYPES: ActivityTypeConfig<PrimaryActivityType>[] = [
  { value: "BUY", icon: "TrendingUp" },
  { value: "SELL", icon: "TrendingDown" },
  { value: "DEPOSIT", icon: "ArrowDownLeft" },
  { value: "WITHDRAWAL", icon: "ArrowUpRight" },
  { value: "DIVIDEND", icon: "Coins" },
  { value: "TRANSFER", icon: "ArrowLeftRight" },
];

const SECONDARY_ACTIVITY_TYPES: ActivityTypeConfig<SecondaryActivityType>[] = [
  { value: "SPLIT", icon: "Split" },
  { value: "FEE", icon: "Receipt" },
  { value: "INTEREST", icon: "Percent" },
  { value: "TAX", icon: "ReceiptText" },
];

function buildResolvedActivityTypes(t: TFunction): ResolvedActivityType[] {
  return [...PRIMARY_ACTIVITY_TYPES, ...SECONDARY_ACTIVITY_TYPES].map((def) => ({
    ...def,
    label: t(`activity.types.${def.value}`),
  }));
}

interface ActivityTypePickerProps {
  value?: ActivityType;
  onSelect: (type: ActivityType) => void;
  /** Optional list of allowed activity types. If not provided, all types are shown. */
  allowedTypes?: readonly string[];
}

type ViewMode = "carousel" | "grid";

function ActivityTypeButton({
  type,
  isSelected,
  onClick,
  onKeyDown,
  buttonRef,
  compact = false,
}: {
  type: ResolvedActivityType;
  isSelected: boolean;
  onClick: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  buttonRef?: (el: HTMLButtonElement | null) => void;
  compact?: boolean;
}) {
  const Icon = Icons[type.icon];

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      onKeyDown={onKeyDown}
      aria-pressed={isSelected}
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 transition-all",
        "hover:bg-muted/50 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
        "cursor-pointer",
        compact ? "min-h-[72px] min-w-[80px] p-3" : "min-h-[80px] p-4",
        isSelected && "border-foreground bg-primary/5",
        !isSelected && "border-border",
      )}
    >
      <Icon
        className={cn(
          "h-5 w-5 transition-colors",
          isSelected ? "text-primary" : "text-muted-foreground",
        )}
      />
      <span
        className={cn(
          "whitespace-nowrap text-sm font-medium transition-colors",
          isSelected ? "text-primary" : "text-foreground",
        )}
      >
        {type.label}
      </span>
    </button>
  );
}

function CarouselView({
  value,
  onSelect,
  types,
}: {
  value?: ActivityType;
  onSelect: (type: ActivityType) => void;
  types: ResolvedActivityType[];
}) {
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  // Set API and track scroll state
  const handleSetApi = useCallback(
    (api: CarouselApi) => {
      if (!api) return;

      const updateScrollState = () => {
        setCanScrollPrev(api.canScrollPrev());
        setCanScrollNext(api.canScrollNext());
      };

      updateScrollState();
      api.on("select", updateScrollState);
      api.on("reInit", updateScrollState);

      // Scroll to selected item on mount
      if (value) {
        const selectedIndex = types.findIndex((t) => t.value === value);
        if (selectedIndex >= 0) {
          setTimeout(() => api.scrollTo(selectedIndex), 0);
        }
      }
    },
    [value, types],
  );

  return (
    <div className="relative overflow-hidden">
      {/* Padding wrapper for selection ring and arrows */}
      <div className="px-1 py-1">
        <Carousel
          opts={{
            align: "start",
            dragFree: true,
            containScroll: "trimSnaps",
          }}
          setApi={handleSetApi}
          className="w-full"
        >
          <CarouselContent className="-ml-2">
            {types.map((type) => (
              <CarouselItem key={type.value} className="basis-auto pl-2">
                <ActivityTypeButton
                  type={type}
                  isSelected={value === type.value}
                  onClick={() => onSelect(type.value)}
                  compact
                />
              </CarouselItem>
            ))}
          </CarouselContent>

          {canScrollPrev && <CarouselPrevious className="left-0 h-7 w-7" />}
          {canScrollNext && <CarouselNext className="right-0 h-7 w-7" />}
        </Carousel>
      </div>
    </div>
  );
}

function GridView({
  value,
  onSelect,
  types,
  ariaGroupLabel,
}: {
  value?: ActivityType;
  onSelect: (type: ActivityType) => void;
  types: ResolvedActivityType[];
  ariaGroupLabel: string;
}) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      const total = types.length;
      const cols = 5; // 5 columns in grid
      let newIndex: number | null = null;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          newIndex = (index + 1) % total;
          break;
        case "ArrowLeft":
          e.preventDefault();
          newIndex = (index - 1 + total) % total;
          break;
        case "ArrowDown":
          e.preventDefault();
          newIndex = (index + cols) % total;
          break;
        case "ArrowUp":
          e.preventDefault();
          newIndex = (index - cols + total) % total;
          break;
        case "Home":
          e.preventDefault();
          newIndex = 0;
          break;
        case "End":
          e.preventDefault();
          newIndex = total - 1;
          break;
      }

      if (newIndex !== null) {
        buttonRefs.current[newIndex]?.focus();
      }
    },
    [types.length],
  );

  return (
    <div className="p-1">
      <div role="group" aria-label={ariaGroupLabel} className="grid grid-cols-5 gap-2">
        {types.map((type, index) => (
          <ActivityTypeButton
            key={type.value}
            type={type}
            isSelected={value === type.value}
            onClick={() => onSelect(type.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            buttonRef={(el) => {
              buttonRefs.current[index] = el;
            }}
            compact
          />
        ))}
      </div>
    </div>
  );
}

export function ActivityTypePicker({ value, onSelect, allowedTypes }: ActivityTypePickerProps) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<ViewMode>("carousel");

  const allTypes = useMemo(() => buildResolvedActivityTypes(t), [t]);

  const filteredTypes = useMemo(
    () =>
      allowedTypes
        ? allTypes.filter((type) => allowedTypes.includes(type.value))
        : allTypes,
    [allTypes, allowedTypes],
  );

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === "carousel" ? "grid" : "carousel"));
  }, []);

  return (
    <div className="space-y-1 overflow-hidden">
      {/* Activity type selector */}
      {viewMode === "carousel" ? (
        <CarouselView value={value} onSelect={onSelect} types={filteredTypes} />
      ) : (
        <GridView
          value={value}
          onSelect={onSelect}
          types={filteredTypes}
          ariaGroupLabel={t("activity.types_picker.aria_all_types")}
        />
      )}

      {/* View toggle at bottom */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={toggleViewMode}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 py-1 transition-colors"
          aria-label={
            viewMode === "carousel"
              ? t("activity.types_picker.expand")
              : t("activity.types_picker.collapse")
          }
        >
          <Icons.ChevronDown
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              viewMode === "grid" && "rotate-180",
            )}
          />
        </button>
      </div>
    </div>
  );
}
