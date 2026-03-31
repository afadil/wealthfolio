import type { Goal } from "@/lib/types";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Progress } from "@wealthfolio/ui/components/ui/progress";
import { AmountDisplay, formatPercent } from "@wealthfolio/ui";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { Link } from "react-router-dom";

const COVER_IMAGE_MAP: Record<string, string> = {
  retirement: "/goals/retirement.png",
  home: "/goals/house.png",
};

const GOAL_TYPE_ICONS: Record<string, React.ReactNode> = {
  retirement: <Icons.Target className="h-8 w-8" />,
  education: <Icons.Briefcase className="h-8 w-8" />,
  home: <Icons.Home className="h-8 w-8" />,
  wedding: <Icons.Star className="h-8 w-8" />,
  emergency_fund: <Icons.ShieldCheck className="h-8 w-8" />,
  custom_save_up: <Icons.Wallet className="h-8 w-8" />,
};

const GOAL_TYPE_LABELS: Record<string, string> = {
  retirement: "Retirement",
  education: "Education",
  home: "Home",
  wedding: "Wedding",
  emergency_fund: "Emergency Fund",
  custom_save_up: "Savings",
};

const HEALTH_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  on_track: { label: "On Track", variant: "default" },
  at_risk: { label: "At Risk", variant: "secondary" },
  off_track: { label: "Off Track", variant: "destructive" },
  not_applicable: { label: "", variant: "outline" },
};

export function GoalCard({ goal }: { goal: Goal }) {
  const { isBalanceHidden } = useBalancePrivacy();
  const progress = goal.progressCached ?? 0;
  const health = HEALTH_CONFIG[goal.statusHealth] ?? HEALTH_CONFIG.not_applicable;
  const typeLabel = GOAL_TYPE_LABELS[goal.goalType] ?? "Goal";
  const coverImage = COVER_IMAGE_MAP[goal.coverImageKey ?? goal.goalType];
  const icon = GOAL_TYPE_ICONS[goal.goalType] ?? GOAL_TYPE_ICONS.custom_save_up;
  const target = goal.targetAmountCached ?? goal.targetAmount ?? 0;
  const current = goal.currentValueCached ?? 0;
  const currency = goal.currency ?? "USD";
  const isAchieved = goal.statusLifecycle === "achieved";

  return (
    <Link to={`/goals/${goal.id}`} className="group block">
      <div className="border-border/60 bg-card hover:border-border shadow-xs relative overflow-hidden rounded-xl border transition-all hover:shadow-md">
        {/* Cover area */}
        <div className="relative h-36 overflow-hidden sm:h-40">
          {coverImage ? (
            <img
              src={coverImage}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="bg-secondary/50 flex h-full w-full items-center justify-center">
              <div className="text-muted-foreground/20 scale-150">{icon}</div>
            </div>
          )}

          {/* Heavy bottom gradient for text legibility on light illustrations */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

          {/* Title overlaid on image */}
          <div className="absolute bottom-3 left-4 right-4">
            <h3 className="truncate text-sm font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
              {goal.title}
            </h3>
            <p className="text-[11px] text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
              {typeLabel}
              {goal.targetDate && <> &middot; {new Date(goal.targetDate).toLocaleDateString()}</>}
            </p>
          </div>

          {/* Status badges */}
          <div className="absolute right-3 top-3 flex gap-1.5">
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
