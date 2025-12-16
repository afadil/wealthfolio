import { useIsMobileViewport } from "@/hooks";
import { useSettingsContext } from "@/lib/settings-provider";
import { Icons } from "@wealthfolio/ui";

import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { settings } = useSettingsContext();
  const isMobile = useIsMobileViewport();
  const settingsTheme = settings?.theme;

  let theme: "light" | "dark" | "system" = "system";
  if (settingsTheme === "light") {
    theme = "light";
  } else if (settingsTheme === "dark") {
    theme = "dark";
  } else if (settingsTheme === "system") {
    theme = "system";
  }

  return (
    <Sonner
      theme={theme}
      position={isMobile ? "top-center" : undefined}
      className="toaster group"
      expand={true}
      richColors
      icons={{
        success: <Icons.CheckCircle className="size-4" />,
        info: <Icons.Info className="size-4" />,
        warning: <Icons.AlertTriangle className="size-4" />,
        error: <Icons.OctagonX className="size-4" />,
        loading: <Icons.Spinner className="size-4 animate-spin" />,
        close: <Icons.Close className="size-4" />,
      }}
      toastOptions={{
        classNames: {
          closeButton: "!absolute !top-2 !right-2 !left-auto !transform-none !border-none",
        },
      }}
      style={
        {
          "--normal-bg": "var(--toast-bg)",
          "--normal-text": "var(--toast-fg)",
          "--normal-border": "var(--toast-border)",
          "--border-radius": "var(--radius)",
          "--success-bg": "var(--toast-success-bg)",
          "--success-text": "var(--toast-success-fg)",
          "--success-border": "var(--toast-success-border)",
          "--error-bg": "var(--toast-error-bg)",
          "--error-text": "var(--toast-error-fg)",
          "--error-border": "var(--toast-error-border)",
          "--warning-bg": "var(--toast-warning-bg)",
          "--warning-text": "var(--toast-warning-fg)",
          "--warning-border": "var(--toast-warning-border)",
          "--info-bg": "var(--toast-info-bg)",
          "--info-text": "var(--toast-info-fg)",
          "--info-border": "var(--toast-info-border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
