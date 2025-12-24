import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface SettingsHeaderProps {
  heading: string;
  text?: string;
  className?: string;
  children?: React.ReactNode;
  showBackOnMobile?: boolean;
  backTo?: string;
  onBack?: () => void;
}

export function SettingsHeader({
  heading,
  text,
  className,
  children,
  showBackOnMobile = true,
  backTo = "/settings",
  onBack,
}: SettingsHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    navigate(backTo);
  };

  return (
    <div
      className={cn(
        // Grid keeps actions pinned top-right on mobile
        "grid grid-cols-[1fr_auto] items-start gap-2",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        {showBackOnMobile && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="ml-1 lg:hidden"
          >
            <Icons.ArrowLeft className="size-6" />
          </Button>
        )}
        <div className="grid min-w-0 gap-1">
          <h1 className="font-heading text-lg font-bold break-words lg:text-xl">{heading}</h1>
          {text && (
            <p className="text-muted-foreground lg:text-md text-sm font-light break-words">
              {text}
            </p>
          )}
        </div>
      </div>
      {children && <div className="justify-self-end">{children}</div>}
    </div>
  );
}
