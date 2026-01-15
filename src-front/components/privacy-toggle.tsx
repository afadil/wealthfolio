import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { cn } from "@/lib/utils";

interface PrivacyToggleProps {
  className?: string;
}

export function PrivacyToggle({ className }: PrivacyToggleProps) {
  const { isBalanceHidden, toggleBalanceVisibility } = useBalancePrivacy();

  return (
    <Button
      variant="secondary"
      size="icon-xs"
      className={cn("rounded-full bg-secondary/50", className)}
      onClick={(e) => {
        e.stopPropagation();
        toggleBalanceVisibility();
      }}
    >
      {isBalanceHidden ? <Icons.Eye className="size-5" /> : <Icons.EyeOff className="size-5" />}
    </Button>
  );
}
