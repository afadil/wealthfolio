import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { useSettingsContext } from "@/lib/settings-provider";
import type { Goal } from "@/lib/types";
import { AmountDisplay, formatPercent } from "@wealthfolio/ui";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Progress } from "@wealthfolio/ui/components/ui/progress";
import { Link } from "react-router-dom";

/** Cover image by convention: /goals/{goalType}.png */
function coverImageSrc(goalType: string): string {
  return `/goals/${goalType}.png`;
}

const GOAL_TYPE_ICONS: Record<string, React.ReactNode> = {
  retirement: <Icons.Target className="h-8 w-8" />,
  education: <Icons.Briefcase className="h-8 w-8" />,
  home: <Icons.Home className="h-8 w-8" />,
  car: <Icons.Car className="h-8 w-8" />,
  wedding: <Icons.Star className="h-8 w-8" />,
  custom_save_up: <Icons.Wallet className="h-8 w-8" />,
};

const GOAL_TYPE_LABELS: Record<string, string> = {
  retirement: "Retirement",
  education: "Education",
  home: "Home Purchase",
  car: "Car Purchase",
  wedding: "Wedding",
  custom_save_up: "Savings Goal",
};

const HEALTH_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "warning" }
> = {
  on_track: { label: "On Track", variant: "default" },
  at_risk: { label: "At Risk", variant: "warning" },
  off_track: { label: "Off Track", variant: "destructive" },
  not_applicable: { label: "", variant: "outline" },
};

export function GoalCard({ goal }: { goal: Goal }) {
  const { isBalanceHidden } = useBalancePrivacy();
  const { settings } = useSettingsContext();
  const progress = goal.summaryProgress ?? 0;
  const health = HEALTH_CONFIG[goal.statusHealth] ?? HEALTH_CONFIG.not_applicable;
  const typeLabel = GOAL_TYPE_LABELS[goal.goalType] ?? "Goal";
  const coverImage = coverImageSrc(goal.coverImageKey ?? goal.goalType);
  const icon = GOAL_TYPE_ICONS[goal.goalType] ?? GOAL_TYPE_ICONS.custom_save_up;
  const target = goal.summaryTargetAmount ?? goal.targetAmount ?? 0;
  const current = goal.summaryCurrentValue ?? 0;
  const currency = settings?.baseCurrency ?? goal.currency ?? "USD";
  const isAchieved = goal.statusLifecycle === "achieved";
  const displayDate = goal.targetDate ?? goal.projectedCompletionDate;

  return (
    <Link to={`/goals/${goal.id}`} className="group block">
      <div className="border-border/60 bg-card hover:border-border shadow-xs relative overflow-hidden rounded-xl border transition-all hover:shadow-md">
        {/* Cover area */}
        <div className="relative h-36 overflow-hidden sm:h-40">
          <img
            src={coverImage}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            onError={(e) => {
              // Fallback: hide broken image, show icon placeholder instead
              e.currentTarget.parentElement!.classList.add("goal-cover-fallback");
              e.currentTarget.style.display = "none";
            }}
          />
          {/* Fallback icon (visible only when image fails via .goal-cover-fallback) */}
          <div className="bg-secondary/50 hidden h-full w-full items-center justify-center [.goal-cover-fallback>&]:flex">
            <div className="text-muted-foreground/20 scale-150">{icon}</div>
          </div>

          {/* Bottom gradient for text legibility */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/30 via-40% to-transparent" />

          {/* Title overlaid on image */}
          <div className="absolute bottom-3 left-4 right-4">
            <h3 className="truncate text-base font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
              {goal.title}
            </h3>
            <p className="flex items-center gap-1.5 text-[11px] text-white/80 drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]">
              {typeLabel}
              {displayDate && <> &middot; {new Date(displayDate).toLocaleDateString()}</>}
            </p>
          </div>

          {/* Status badges */}
          <div className="absolute left-3 top-3 flex gap-1.5">
            {isAchieved && (
              <Badge className="border-0 bg-green-600/90 text-[10px] text-white backdrop-blur-sm">
                Achieved
              </Badge>
            )}
            {!isAchieved && health.label && (
              <Badge variant={health.variant} className="border-0 text-[10px] backdrop-blur-sm">
                {health.label}
              </Badge>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="space-y-2.5 px-4 pb-4 pt-3">
          {/* Amounts row */}
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-base font-bold tabular-nums">
              <AmountDisplay value={current} currency={currency} isHidden={isBalanceHidden} />
            </span>
            {target > 0 && (
              <span className="text-muted-foreground text-[11px]">
                of <AmountDisplay value={target} currency={currency} isHidden={isBalanceHidden} />
              </span>
            )}
          </div>

          {/* Progress */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-muted-foreground text-[11px]">Progress</span>
              <span className="text-[11px] font-medium tabular-nums">
                {formatPercent(progress)}
              </span>
            </div>
            <Progress value={Math.min(progress * 100, 100)} className="[&>div]:bg-success h-1.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}
