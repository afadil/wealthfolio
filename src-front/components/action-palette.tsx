import * as React from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@wealthfolio/ui/components/ui/popover";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { cn } from "@wealthfolio/ui/lib/utils";
import { useHapticFeedback } from "@/hooks";

export interface ActionPaletteItem {
  icon: "Plus" | "Minus" | "Pencil" | "Refresh" | "Trash" | "Eye" | "EyeOff" | "Settings2" | "Download" | "Upload" | "Copy" | "ExternalLink" | "HandCoins" | "MoreVertical" | "TrendingUp" | "TrendingDown" | "Coins" | "Ellipsis" | "History" | "Fullscreen";
  label: string;
  onClick: () => void;
  variant?: "default" | "destructive";
}

export interface ActionPaletteGroup {
  title?: string;
  items: ActionPaletteItem[];
}

interface ActionPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  groups: ActionPaletteGroup[];
  trigger?: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
}

const iconMap: Record<ActionPaletteItem["icon"], React.ComponentType<{ className?: string }>> = {
  Plus: Icons.Plus,
  Minus: Icons.Minus,
  Pencil: Icons.Pencil,
  Refresh: Icons.Refresh,
  Trash: Icons.Trash,
  Eye: Icons.Eye,
  EyeOff: Icons.EyeOff,
  Settings2: Icons.Settings2,
  Download: Icons.Download,
  Upload: Icons.Upload,
  Copy: Icons.Copy,
  ExternalLink: Icons.ExternalLink,
  HandCoins: Icons.HandCoins,
  MoreVertical: Icons.MoreVertical,
  TrendingUp: Icons.TrendingUp,
  TrendingDown: Icons.TrendingDown,
  Coins: Icons.Coins,
  Ellipsis: Icons.Ellipsis,
  History: Icons.History,
  Fullscreen: Icons.Fullscreen,
};

export function ActionPalette({
  open,
  onOpenChange,
  title,
  groups,
  trigger,
  align = "end",
  side = "bottom",
}: ActionPaletteProps) {
  const triggerHaptic = useHapticFeedback();

  const handleItemClick = React.useCallback(
    (item: ActionPaletteItem) => {
      triggerHaptic();
      item.onClick();
      onOpenChange(false);
    },
    [triggerHaptic, onOpenChange]
  );

  const handleClose = React.useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="icon" className="h-9 w-9">
            <Icons.DotsThreeVertical className="h-5 w-5" weight="fill" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        sideOffset={8}
        className={cn(
          "w-auto min-w-[260px] max-w-[320px] p-0",
          "rounded-2xl",
          "border border-border/50 dark:border-white/10",
          "bg-card backdrop-blur-xl",
          "shadow-lg"
        )}
      >
        {/* Header - only show if title provided */}
        {title && (
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-lg font-bold text-foreground">{title}</h3>
            <button
              onClick={handleClose}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full",
                "bg-muted/80 hover:bg-muted",
                "text-muted-foreground hover:text-foreground",
                "transition-colors duration-150",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
              aria-label="Close"
            >
              <Icons.X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Action Groups */}
        <div className={cn("px-3 pb-4", !title && "pt-3")}>
          {groups.map((group, groupIndex) => (
            <div key={groupIndex}>
              {group.title && (
                <div className="px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {group.title}
                </div>
              )}
              <div>
                {group.items.map((item, itemIndex) => {
                  const IconComponent = iconMap[item.icon];
                  const isDestructive = item.variant === "destructive";
                  return (
                    <React.Fragment key={itemIndex}>
                      {itemIndex > 0 && (
                        <div className="mx-3 h-px bg-border/70" />
                      )}
                      <button
                        onClick={() => handleItemClick(item)}
                        className={cn(
                          "flex w-full items-center gap-4 rounded-xl px-3 py-3",
                          "transition-colors duration-150",
                          isDestructive
                            ? "text-destructive hover:bg-destructive/10 active:bg-destructive/15"
                            : "text-foreground hover:bg-accent active:bg-accent/80",
                          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                        )}
                      >
                        <IconComponent
                          className={cn(
                            "h-5 w-5 flex-shrink-0",
                            isDestructive ? "text-destructive" : "text-muted-foreground"
                          )}
                        />
                        <span className="text-[15px] font-medium">{item.label}</span>
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>
              {groupIndex < groups.length - 1 && (
                <div className="my-1.5 mx-3 h-px bg-border/70" />
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
