import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@wealthfolio/ui/components/ui/tooltip";

type RiskLevel = "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH";

interface RiskBadgeProps {
  level: RiskLevel | null | undefined;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}

const RISK_CONFIG: Record<
  RiskLevel,
  { label: string; dotClass: string; textClass: string }
> = {
  UNKNOWN: {
    label: "Unknown",
    dotClass: "bg-muted-foreground",
    textClass: "text-muted-foreground",
  },
  LOW: {
    label: "Low",
    dotClass: "bg-success",
    textClass: "text-success",
  },
  MEDIUM: {
    label: "Medium",
    dotClass: "bg-warning",
    textClass: "text-warning",
  },
  HIGH: {
    label: "High",
    dotClass: "bg-destructive",
    textClass: "text-destructive",
  },
};

function normalizeLevel(level: RiskLevel | null | undefined): RiskLevel {
  if (!level) return "UNKNOWN";
  const normalized = level.toUpperCase();
  if (normalized in RISK_CONFIG) {
    return normalized as RiskLevel;
  }
  return "UNKNOWN";
}

export function RiskBadge({
  level,
  size = "md",
  showLabel = true,
  className,
}: RiskBadgeProps) {
  const normalizedLevel = normalizeLevel(level);
  const config = RISK_CONFIG[normalizedLevel];

  const dotSizeClass = size === "sm" ? "size-2" : "size-2.5";
  const textSizeClass = size === "sm" ? "text-xs" : "text-sm";

  const dot = (
    <span
      className={cn("inline-block shrink-0 rounded-full", dotSizeClass, config.dotClass)}
      aria-hidden="true"
    />
  );

  const content = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        textSizeClass,
        config.textClass,
        className
      )}
    >
      {dot}
      {showLabel && <span className="font-medium">{config.label}</span>}
    </span>
  );

  if (!showLabel) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("inline-flex cursor-default", className)}>{dot}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{config.label}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}
