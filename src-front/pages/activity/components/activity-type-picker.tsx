import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@wealthfolio/ui/components/ui/dropdown-menu";
import { Icons, type IconName } from "@wealthfolio/ui/components/ui/icons";
import { cn } from "@/lib/utils";

export type PrimaryActivityType = "BUY" | "SELL" | "DEPOSIT" | "WITHDRAWAL" | "DIVIDEND" | "TRANSFER";
export type SecondaryActivityType = "SPLIT" | "FEE" | "INTEREST" | "TAX";
export type ActivityType = PrimaryActivityType | SecondaryActivityType;

interface ActivityTypeConfig<T extends string> {
  value: T;
  label: string;
  icon: IconName;
}

const PRIMARY_ACTIVITY_TYPES: ActivityTypeConfig<PrimaryActivityType>[] = [
  { value: "BUY", label: "Buy", icon: "TrendingUp" },
  { value: "SELL", label: "Sell", icon: "TrendingDown" },
  { value: "DEPOSIT", label: "Deposit", icon: "ArrowDownLeft" },
  { value: "WITHDRAWAL", label: "Withdrawal", icon: "ArrowUpRight" },
  { value: "DIVIDEND", label: "Dividend", icon: "Coins" },
  { value: "TRANSFER", label: "Transfer", icon: "ArrowLeftRight" },
];

const SECONDARY_ACTIVITY_TYPES: ActivityTypeConfig<SecondaryActivityType>[] = [
  { value: "SPLIT", label: "Split", icon: "Split" },
  { value: "FEE", label: "Fee", icon: "Receipt" },
  { value: "INTEREST", label: "Interest", icon: "Percent" },
  { value: "TAX", label: "Tax", icon: "ReceiptText" },
];

interface ActivityTypePickerProps {
  value?: ActivityType;
  onSelect: (type: ActivityType) => void;
}

export function ActivityTypePicker({ value, onSelect }: ActivityTypePickerProps) {
  const selectedSecondaryType = SECONDARY_ACTIVITY_TYPES.find((t) => t.value === value);
  const isSecondarySelected = !!selectedSecondaryType;

  return (
    <div className="space-y-3">
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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 transition-all",
              "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "cursor-pointer text-sm",
              isSecondarySelected && "border-primary bg-primary/5 ring-1 ring-primary",
              !isSecondarySelected && "border-border",
            )}
          >
            {isSecondarySelected ? (
              <>
                {(() => {
                  const Icon = Icons[selectedSecondaryType.icon];
                  return <Icon className="h-4 w-4 text-primary" />;
                })()}
                <span className="font-medium text-primary">{selectedSecondaryType.label}</span>
              </>
            ) : (
              <>
                <Icons.MoreVertical className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">More</span>
              </>
            )}
            <Icons.ChevronDown className="ml-1 h-4 w-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-48">
          {SECONDARY_ACTIVITY_TYPES.map((type) => {
            const Icon = Icons[type.icon];
            const isSelected = value === type.value;

            return (
              <DropdownMenuItem
                key={type.value}
                onClick={() => onSelect(type.value)}
                className={cn(isSelected && "bg-primary/5 text-primary")}
              >
                <Icon className={cn("mr-2 h-4 w-4", isSelected && "text-primary")} />
                <span className={cn(isSelected && "font-medium")}>{type.label}</span>
                {isSelected && <Icons.Check className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
