import { Icons, type IconName } from "@wealthfolio/ui/components/ui/icons";
import { cn } from "@/lib/utils";

export type PrimaryActivityType = "BUY" | "SELL" | "DEPOSIT" | "WITHDRAWAL" | "DIVIDEND" | "TRANSFER";

interface ActivityTypeConfig {
  value: PrimaryActivityType;
  label: string;
  icon: IconName;
}

const PRIMARY_ACTIVITY_TYPES: ActivityTypeConfig[] = [
  { value: "BUY", label: "Buy", icon: "TrendingUp" },
  { value: "SELL", label: "Sell", icon: "TrendingDown" },
  { value: "DEPOSIT", label: "Deposit", icon: "ArrowDownLeft" },
  { value: "WITHDRAWAL", label: "Withdrawal", icon: "ArrowUpRight" },
  { value: "DIVIDEND", label: "Dividend", icon: "Coins" },
  { value: "TRANSFER", label: "Transfer", icon: "ArrowLeftRight" },
];

interface ActivityTypePickerProps {
  value?: PrimaryActivityType;
  onSelect: (type: PrimaryActivityType) => void;
}

export function ActivityTypePicker({ value, onSelect }: ActivityTypePickerProps) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
      {PRIMARY_ACTIVITY_TYPES.map((type) => {
        const Icon = Icons[type.icon];
        const isSelected = value === type.value;

        return (
          <button
            key={type.value}
            type="button"
            onClick={() => onSelect(type.value)}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-lg border p-4 transition-all",
              "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "min-h-[80px] cursor-pointer",
              isSelected && "border-primary bg-primary/5 ring-1 ring-primary",
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
                "text-sm font-medium transition-colors",
                isSelected ? "text-primary" : "text-foreground",
              )}
            >
              {type.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
