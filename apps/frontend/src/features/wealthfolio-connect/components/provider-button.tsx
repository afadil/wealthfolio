import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface ProviderButtonProps {
  provider: "google" | "apple" | "email";
  onClick: () => void;
  isLoading: boolean;
  isLastUsed?: boolean;
  variant?: "default" | "outline";
  className?: string;
  type?: "button" | "submit";
}

export function ProviderButton({
  provider,
  onClick,
  isLoading,
  isLastUsed = false,
  variant = "outline",
  className,
  type = "button",
}: ProviderButtonProps) {
  const { t } = useTranslation("common");

  const providerConfig = {
    google: {
      icon: Icons.Google,
      labelKey: "connect.provider.continue_google",
    },
    apple: {
      icon: Icons.Apple,
      labelKey: "connect.provider.continue_apple",
    },
    email: {
      icon: Icons.Mail,
      labelKey: "connect.provider.continue_email",
    },
  };

  const config = providerConfig[provider];
  const Icon = config.icon;

  return (
    <Button
      type={type}
      variant={variant}
      onClick={onClick}
      disabled={isLoading}
      className={cn("relative h-12 w-full max-w-sm justify-start gap-3", className)}
    >
      {isLoading ? (
        <Icons.Spinner className="h-5 w-5 animate-spin" />
      ) : (
        <Icon className="h-5 w-5" />
      )}
      <span className="flex-1 text-center">{t(config.labelKey)}</span>
      {isLastUsed && !isLoading && (
        <span className="text-muted-foreground absolute right-3 text-xs">
          {t("connect.provider.last_used")}
        </span>
      )}
    </Button>
  );
}
